import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");

test("Prometheus securely scrapes the protected API and loads alert rules", () => {
  const config = YAML.parse(read("observability/prometheus/prometheus.yml"));
  const job = config.scrape_configs.find(({ job_name: name }) => name === "idea-holiday-api");
  assert.ok(job);
  assert.equal(job.metrics_path, "/api/metrics");
  assert.equal(job.authorization.type, "Bearer");
  assert.equal(job.authorization.credentials_file, "/tmp/metrics_token");
  assert.deepEqual(config.rule_files, ["/etc/prometheus/alerts.yml"]);

  const rules = YAML.parse(read("observability/prometheus/alerts.yml"));
  const alerts = new Set(rules.groups.flatMap((group) => group.rules.map((rule) => rule.alert)));
  for (const required of [
    "IdeaHolidayMetricsMissing",
    "IdeaHolidayHigh5xxRate",
    "IdeaHolidaySlowApiP95",
    "IdeaHolidaySlowDatabaseP95",
    "IdeaHolidayPaymentFailureRate",
    "IdeaHolidayPoorLcpP95",
    "IdeaHolidayPoorInpP95",
  ]) {
    assert.equal(alerts.has(required), true, `${required} must be provisioned`);
  }
});

test("Grafana provisions a shared datasource and valid, uniquely identified dashboards", () => {
  const datasource = YAML.parse(read("observability/grafana/provisioning/datasources/prometheus.yml"));
  assert.equal(datasource.datasources[0].uid, "idea-holiday-prometheus");
  assert.equal(datasource.datasources[0].url, "http://prometheus:9090");

  const dashboards = [
    JSON.parse(read("observability/grafana/dashboards/api-health.json")),
    JSON.parse(read("observability/grafana/dashboards/marketplace-ux.json")),
  ];
  assert.equal(new Set(dashboards.map(({ uid }) => uid)).size, dashboards.length);
  for (const dashboard of dashboards) {
    assert.ok(dashboard.title.startsWith("Idea Holiday"));
    assert.ok(dashboard.panels.length >= 6);
    for (const panel of dashboard.panels) {
      assert.equal(panel.datasource.uid, "idea-holiday-prometheus");
      assert.ok(panel.targets.every(({ expr }) => expr.includes("idea_holiday_")));
    }
  }
});

test("observability configuration contains secret references but no committed credentials", () => {
  const files = [
    "docker-compose.observability.yml",
    "observability/prometheus/prometheus.yml",
    "observability/prometheus/alerts.yml",
    "observability/grafana/provisioning/datasources/prometheus.yml",
    "observability/grafana/provisioning/dashboards/dashboards.yml",
  ].map(read).join("\n");
  assert.match(files, /METRICS_TOKEN/);
  assert.match(files, /GRAFANA_ADMIN_PASSWORD/);
  assert.doesNotMatch(files, /sb_secret_|service_role|eyJhbGciOi/);
  assert.doesNotMatch(files, /credentials:\s+[A-Za-z0-9_-]{32,}/);
});
