# Idea Holiday observability

This directory provides a reproducible local/self-hosted monitoring stack for the metrics already emitted by the backend. It includes Prometheus scraping, seven initial service alerts, and provisioned Grafana dashboards for API health and marketplace/user-experience signals. No credential is stored in these files.

## Start locally

1. Start the backend on port `4000`.
2. Set a dedicated random scraper token of at least 32 characters in the backend and in the shell that runs Compose.
3. Set a strong local Grafana admin password.
4. Start the stack.

```bash
export METRICS_TOKEN="$(openssl rand -hex 32)"
export GRAFANA_ADMIN_PASSWORD="$(openssl rand -base64 24)"
docker compose -f docker-compose.observability.yml up -d
```

Use the same `METRICS_TOKEN` value in `backend/.env`, then restart the backend. Open Prometheus at `http://localhost:9090` and Grafana at `http://localhost:3002`. Grafana loads both dashboards automatically under the **Idea Holiday** folder.

Stop the containers without deleting their data:

```bash
docker compose -f docker-compose.observability.yml down
```

Add `--volumes` only when intentionally discarding local metric and dashboard state.

## Validate configuration

```bash
METRICS_TOKEN="validation-token-with-at-least-32-characters" \
GRAFANA_ADMIN_PASSWORD="validation-password" \
docker compose -f docker-compose.observability.yml config --quiet

docker run --rm \
  --entrypoint /bin/sh \
  -e METRICS_TOKEN="validation-token-with-at-least-32-characters" \
  -v "$PWD/observability/prometheus:/etc/prometheus:ro" \
  prom/prometheus:v3.14.0 \
  -ec 'printf "%s" "$METRICS_TOKEN" > /tmp/metrics_token && promtool check config /etc/prometheus/prometheus.yml'
```

The backend test suite also parses the YAML and dashboards, checks the security-sensitive scrape settings, and verifies all required alert names.

## Production rollout

The current application is deployed to Cloud Run. Google recommends its Managed Service for Prometheus sidecar for Prometheus-style Cloud Run metrics. That rollout needs Cloud project access, Secret Manager configuration, a multi-container Cloud Run service definition, and live verification in Metrics Explorer. Keep `METRICS_TOKEN` in Secret Manager and never place it in a service manifest or repository file.

Before production rollout:

- create and grant a dedicated Cloud Run service account `roles/monitoring.metricWriter` and `roles/logging.logWriter`;
- store the scraper token and any custom collector configuration in Secret Manager;
- use instance-based billing/always-allocated CPU for more reliable sidecar collection;
- apply the same alert expressions in Cloud Monitoring or connect Alertmanager notification routing;
- verify `up`, request rate, p95 latency, 5xx ratio, payment failures, and Web Vitals with real traffic;
- configure notification receivers and escalation ownership before calling alerting operational.

Production sidecar deployment and notification routing remain intentionally pending because they change live cloud resources and require project credentials and an incident destination.
