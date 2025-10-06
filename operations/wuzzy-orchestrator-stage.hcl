job "wuzzy-orchestrator-stage" {
  datacenters = ["mb-hel"]
  type = "service"

  group "wuzzy-orchestrator-stage-group" {
    count = 1

    network {
      mode = "bridge"
      port "http" {
        host_network = "wireguard"
      }
    }

    task "wuzzy-orchestrator-stage-task" {
      driver = "docker"

      config {
        image = "ghcr.io/memetic-block/wuzzy-orchestrator:${VERSION}"
      }

      env {
        VERSION="[[ .commit_sha ]]"
        PORT="${NOMAD_PORT_http}"

      }

      template {
        data = <<-EOF
        {{- range service "wuzzy-orchestrator-redis-stage" }}
        REDIS_HOST="{{ .Address }}"
        REDIS_PORT="{{ .Port }}"
        {{- end }}
        {{- range service "wuzzy-orchestrator-postgres-stage" }}
        DB_HOST="{{ .Address }}"
        DB_PORT="{{ .Port }}"
        {{- end }}
        EOF
        env = true
        destination = "local/config.env"
      }

      vault { policies = [ "wuzzy-orchestrator-stage" ] }

      template {
        data = <<-EOF
        {{ with secret "kv/wuzzy/orchestrator-stage" }}
        DB_USERNAME="{{ .Data.data.DB_USER }}"
        DB_PASSWORD="{{ .Data.data.DB_PASSWORD }}"
        {{ end }}
        EOF
        destination = "secrets/config.env"
        env = true
      }

      restart {
        attempts = 0
        mode     = "fail"
      }

      resources {
        cpu    = 2048
        memory = 4096
      }

      service {
        name = "wuzzy-orchestrator-stage"
        port = "http"

        check {
          type     = "http"
          path     = "/"
          interval = "10s"
          timeout  = "5s"
        }
      }
    }
  }
}
