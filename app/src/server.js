"use strict";

const http = require("node:http");
const { metrics } = require("@opentelemetry/api");
const { OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-http");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const {
  AggregationType,
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} = require("@opentelemetry/semantic-conventions");

const port = Number(process.env.PORT ?? 8080);
const serviceName = process.env.OTEL_SERVICE_NAME ?? "demo-app";
const exportIntervalMillis = Number(
  process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 5000,
);

const exporter = new OTLPMetricExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ??
    "http://localhost:4318/v1/metrics",
});

const metricReader = new PeriodicExportingMetricReader({
  exporter,
  exportIntervalMillis,
});

const meterProvider = new MeterProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: "1.0.0",
    "deployment.environment.name": "demo",
  }),
  views: [
    {
      instrumentName: "demo_request_duration",
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: {
          boundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
        },
      },
    },
  ],
  readers: [metricReader],
});

metrics.setGlobalMeterProvider(meterProvider);
const meter = metrics.getMeter("demo-app-meter", "1.0.0");

const requestCounter = meter.createCounter("demo_requests", {
  description: "Total demo requests processed",
});
const errorCounter = meter.createCounter("demo_errors", {
  description: "Total demo errors generated",
});
const durationHistogram = meter.createHistogram("demo_request_duration", {
  description: "Demo request duration",
  unit: "s",
});
const jobsCounter = meter.createCounter("demo_jobs_processed", {
  description: "Total background jobs processed",
});

let activeUsers = 4;
const activeUsersGauge = meter.createObservableGauge("demo_active_users", {
  description: "Current simulated active users",
});
activeUsersGauge.addCallback((result) => {
  result.observe(activeUsers);
});

function recordRequest(route, statusCode, durationSeconds) {
  const attributes = {
    "http.route": route,
    "http.response.status_code": statusCode,
  };

  requestCounter.add(1, attributes);
  durationHistogram.record(durationSeconds, attributes);

  if (statusCode >= 500) {
    errorCounter.add(1, attributes);
  }
}

function simulateBackgroundTraffic() {
  const route = Math.random() < 0.7 ? "/api/orders" : "/api/products";
  const failed = Math.random() < 0.06;
  const statusCode = failed ? 500 : 200;
  const durationSeconds = failed
    ? 0.4 + Math.random() * 0.7
    : 0.03 + Math.random() * 0.25;

  activeUsers = Math.max(
    1,
    Math.min(25, activeUsers + (Math.random() > 0.5 ? 1 : -1)),
  );
  recordRequest(route, statusCode, durationSeconds);
  jobsCounter.add(Math.floor(1 + Math.random() * 5), { queue: "orders" });
}

const workloadTimer = setInterval(simulateBackgroundTraffic, 1000);
workloadTimer.unref();

const server = http.createServer((request, response) => {
  const startedAt = process.hrtime.bigint();
  const route = request.url === "/error" ? "/error" : request.url === "/health" ? "/health" : "/";
  const statusCode = route === "/error" ? 500 : 200;

  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      message:
        route === "/error"
          ? "A demo error was generated."
          : "OpenTelemetry metrics demo is running.",
      endpoints: ["/", "/error", "/health"],
    }),
  );

  const durationSeconds =
    Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  recordRequest(route, statusCode, durationSeconds);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`${serviceName} listening on http://0.0.0.0:${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  clearInterval(workloadTimer);
  server.close();
  await meterProvider.shutdown();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
