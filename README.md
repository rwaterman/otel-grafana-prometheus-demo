# OpenTelemetry, Prometheus, and Grafana demo

This repository runs a complete local metrics pipeline with Docker Compose:

```text
Node.js demo app --OTLP/HTTP push--> OpenTelemetry Collector
                                         |
                                  Prometheus exporter
                                         |
                              Prometheus scrapes metrics
                                         |
                                  Grafana dashboard
```

The app emits a counter, histogram, error counter, observable gauge, and
background-job counter. It also generates low-volume sample traffic so the
dashboard has data immediately.

## Start the demo

Requirements:

- Docker with Docker Compose v2
- About 1 GB of free memory

Run:

```bash
docker compose up --build -d
```

Then open:

- Demo app: <http://localhost:8080>
- Grafana: <http://localhost:3000> (`admin` / `admin`)
- Prometheus: <http://localhost:9090>
- Collector health endpoint: <http://localhost:13133>

Grafana is provisioned with the Prometheus data source and the
**OpenTelemetry Metrics Demo** dashboard. Metrics normally appear within
10-15 seconds.

Generate an explicit success or error request:

```bash
curl http://localhost:8080/
curl http://localhost:8080/error
```

## Data flow

1. `demo-app` records metrics with the OpenTelemetry JavaScript SDK.
2. Its periodic metric reader pushes OTLP/HTTP payloads to
   `otel-collector:4318/v1/metrics` every five seconds.
3. The collector converts OTLP metrics to Prometheus exposition format on
   port `8889`.
4. Prometheus scrapes the collector every five seconds.
5. Grafana queries Prometheus using its provisioned data source.

Prometheus remains pull-based. The application does not push directly to
Prometheus; it pushes OTLP metrics to the collector.

## Useful commands

```bash
make up
make ps
make logs
make down
make clean
```

`make clean` also removes the Grafana and Prometheus data volumes.

## Configuration

- `compose.yaml`: service topology and published ports
- `app/src/server.js`: application metrics and sample workload
- `otel-collector/config.yaml`: OTLP receiver and Prometheus exporter
- `prometheus/prometheus.yaml`: collector scrape target
- `grafana/provisioning`: automatic data source and dashboard loading
- `grafana/dashboards/demo-app.json`: demo dashboard

To send metrics from another local application, export OTLP/HTTP metrics to
`http://localhost:4318/v1/metrics` and give the application a distinct
`service.name`.

## Stop the demo

```bash
docker compose down
```
