job "arns-indexer" {
  datacenters = ["mb-hel"]
  type = "service"

  group "arns-indexer-group" {
    count = 1

    network {
      mode = "bridge"
      port "http" {
        host_network = "wireguard"
      }
    }

    volume "arns-indexer" {
      type      = "host"
      read_only = false
      source    = "arns-indexer"
    }

    task "arns-indexer-task" {
      driver = "docker"

      config {
        image = "ghcr.io/memetic-block/arns-indexer:${VERSION}"
      }

      volume_mount {
        volume = "arns-indexer"
        destination = "/usr/src/app/data"
        read_only = false
      }

      env {
        VERSION="[[ .commit_sha ]]"
        PORT="${NOMAD_PORT_http}"
        DB_NAME="arns_indexer"
        REDIS_MODE="standalone"
        ANT_TARGET_BLACKLIST_FILE="/usr/src/app/data/ant-target-blacklist.txt"
        ANT_PROCESS_ID_BLACKLIST_FILE="/usr/src/app/data/ant-process-id-blacklist.txt"
        DO_CLEAN="true"
        DB_MIGRATIONS_RUN="true"
      }

      template {
        data = <<-EOF
        {{- range service "arns-indexer-redis" }}
        REDIS_HOST="{{ .Address }}"
        REDIS_PORT="{{ .Port }}"
        {{- end }}
        {{- range service "arns-indexer-postgres" }}
        DB_HOST="{{ .Address }}"
        DB_PORT="{{ .Port }}"
        {{- end }}
        {{- range service "arns-indexer-cu" }}
        CU_URL="http://{{ .Address }}:{{ .Port }}"
        {{- end }}
        EOF
        env = true
        destination = "local/config.env"
      }

      vault { policies = [ "wuzzy-arns-indexer-postgres" ] }

      template {
        data = <<-EOF
        {{ with secret "kv/wuzzy/arns-indexer/postgres" }}
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
        name = "arns-indexer"
        port = "http"

        check {
          name     = "arns-indexer-http-check"
          type     = "http"
          path     = "/"
          interval = "10s"
          timeout  = "5s"
        }
      }
    }
  }
}
