job "wuzzy-orchestrator-stage" {
  datacenters = ["mb-hel"]
  type = "service"

  reschedule {
    attempts = 0
  }

  group "wuzzy-orchestrator-stage-group" {
    count = 1

    update {
      stagger      = "30s"
      max_parallel = 1
      canary       = 1
      auto_revert  = true
      auto_promote = true
    }

    network {
      mode = "bridge"
      port "http" {
        host_network = "wireguard"
      }
    }

    task "wuzzy-orchestrator-stage-task" {
      driver = "docker"

      config {
        image = "ghcr.io/memetic-block/wuzzy-orchestrator-stage:${VERSION}"
      }

      env {
        VERSION="[[ .commit_sha ]]"
        PORT="${NOMAD_PORT_http}"

      }

      template {
        data = <<-EOF
        {{- range service "wuzzy-orchestrator-stage-redis" }}
        REDIS_HOST="{{ .Address }}"
        REDIS_PORT="{{ .Port }}"
        {{- end }}
        {{- range service "wuzzy-orchestrator-stage-postgres" }}
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
        {{ with secret "kv/wuzzy/tx-oracle" }}
        DB_USERNAME="{{ .Data.data.DB_USER }}"
        DB_PASSWORD="{{ .Data.data.DB_PASSWORD }}"
        {{ end }}
        EOF
        destination = "secrets/config.env"
        env = true
      }

      template {
        data = <<-EOF
        {{- with secret `kv/wuzzy/tx-oracle` }}
        {{- base64Decode .Data.data.ORACLE_KEY_BASE64 }}
        {{- end }}
        EOF
        destination = "secrets/oracle_key.json"
      }

      restart {
        attempts = 0
        mode     = "fail"
      }

      resources {
        cpu    = 1024
        memory = 2048
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
