job "arns-indexer-live" {
  datacenters = ["mb-hel"]
  type = "service"

  group "arns-indexer-live-group" {
    count = 1

    network {
      mode = "bridge"
      port "http" {
        host_network = "wireguard"
      }
    }

    volume "arns-indexer-live" {
      type      = "host"
      read_only = false
      source    = "arns-indexer-live"
    }

    task "arns-indexer-live-task" {
      driver = "docker"

      config {
        image = "ghcr.io/memetic-block/arns-indexer:${VERSION}"
      }

      volume_mount {
        volume = "arns-indexer-live"
        destination = "/usr/src/app/data"
        read_only = false
      }

      env {
        DO_CLEAN="true"
        VERSION="[[ .commit_sha ]]"
        PORT="${NOMAD_PORT_http}"
        DB_NAME="arns-indexer-live"
        REDIS_MODE="standalone"
        ANT_TARGET_BLACKLIST_FILE="/usr/src/app/data/ant-target-blacklist.txt"
        ANT_PROCESS_ID_BLACKLIST_FILE="/usr/src/app/data/ant-process-id-blacklist.txt"
        ARNS_CRAWL_GATEWAY="frostor.xyz"
      }

      template {
        data = <<-EOF
        {{- range service "arns-indexer-redis-live" }}
        REDIS_HOST="{{ .Address }}"
        REDIS_PORT="{{ .Port }}"
        {{- end }}
        {{- range service "arns-indexer-postgres-live" }}
        DB_HOST="{{ .Address }}"
        DB_PORT="{{ .Port }}"
        {{- end }}
        {{- range service "wuzzy-cu" }}
        CU_URL="http://{{ .Address }}:{{ .Port }}"
        {{- end }}
        EOF
        env = true
        destination = "local/config.env"
      }

      vault { policies = [ "arns-indexer-live" ] }

      template {
        data = <<-EOF
        {{ with secret "kv/wuzzy/arns-indexer-live" }}
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
        name = "arns-indexer-live"
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
