/**
 * A small, dependency-free replacement for k6's default end-of-test summary.
 *
 * Defining `handleSummary` suppresses k6's built-in stdout report, so anything we still want to
 * see (threshold pass/fail above all) has to be printed here. The usual alternative is
 * `textSummary` from https://jslib.k6.io/k6-summary/, but that is a remote import resolved at
 * run time — this keeps the scripts runnable with no network access beyond the target.
 */

const PASS = '✓';
const FAIL = '✗';

function metricValues(data, name) {
  const metric = data.metrics[name];
  return metric ? metric.values : undefined;
}

function num(value, digits = 2, suffix = '') {
  return value === undefined || value === null || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}${suffix}`;
}

function line(label, value) {
  return `  ${label.padEnd(28)} ${value}`;
}

/** Flattens every threshold across every metric into `{ metric, expression, ok }` rows. */
function collectThresholds(data) {
  const rows = [];
  for (const [metricName, metric] of Object.entries(data.metrics)) {
    if (!metric.thresholds) continue;
    for (const [expression, result] of Object.entries(metric.thresholds)) {
      // k6 has reported this as both a bare boolean and as `{ ok: boolean }` across versions.
      const ok = typeof result === 'boolean' ? result : result && result.ok !== false;
      rows.push({ metric: metricName, expression, ok });
    }
  }
  return rows;
}

/**
 * @param {object} data      the object k6 hands to `handleSummary`
 * @param {string} title     heading for the report
 * @param {string} jsonPath  where to write the raw JSON (relative to the k6 working directory)
 * @param {Array<[string, string]>} extraMetrics  `[metricName, label]` custom metrics to include
 */
export function renderSummary(data, title, jsonPath, extraMetrics = []) {
  const duration = metricValues(data, 'http_req_duration') || {};
  const reqs = metricValues(data, 'http_reqs') || {};
  const failed = metricValues(data, 'http_req_failed') || {};
  const errors = metricValues(data, 'errors');

  const lines = [
    '',
    '='.repeat(64),
    `  ${title}`,
    '='.repeat(64),
    line('Total HTTP requests', num(reqs.count, 0)),
    line('Requests/sec', num(reqs.rate)),
    line('Failed requests', num((failed.rate || 0) * 100, 2, '%')),
  ];

  if (errors) {
    lines.push(line('Checked-error rate', num(errors.rate * 100, 2, '%')));
  }

  lines.push(
    '',
    line('Avg response time', num(duration.avg, 2, 'ms')),
    line('p90 response time', num(duration['p(90)'], 2, 'ms')),
    line('p95 response time', num(duration['p(95)'], 2, 'ms')),
    line('Max response time', num(duration.max, 2, 'ms'))
  );

  const extras = extraMetrics
    .map(([name, label]) => [label, metricValues(data, name)])
    .filter(([, values]) => values !== undefined);

  if (extras.length > 0) {
    lines.push('', '  Custom metrics');
    for (const [label, values] of extras) {
      if (values.count !== undefined && values.avg === undefined && values.rate === undefined) {
        lines.push(line(label, num(values.count, 0)));
      } else if (values.rate !== undefined && values.avg === undefined) {
        lines.push(line(label, num(values.rate * 100, 2, '%')));
      } else if (values.avg !== undefined) {
        lines.push(line(label, `avg ${num(values.avg, 0, 'ms')}  p95 ${num(values['p(95)'], 0, 'ms')}`));
      } else {
        lines.push(line(label, num(values.count, 0)));
      }
    }
  }

  const thresholds = collectThresholds(data);
  if (thresholds.length > 0) {
    lines.push('', '  Thresholds');
    for (const { metric, expression, ok } of thresholds) {
      lines.push(`  ${ok ? PASS : FAIL} ${metric} ${expression}`);
    }
    const breached = thresholds.filter((t) => !t.ok).length;
    lines.push(
      '',
      breached === 0
        ? `  ${PASS} All ${thresholds.length} thresholds passed.`
        : `  ${FAIL} ${breached} of ${thresholds.length} thresholds breached — k6 will exit non-zero.`
    );
  }

  lines.push('='.repeat(64), `  Raw results written to ${jsonPath}`, '');

  return {
    stdout: lines.join('\n'),
    [jsonPath]: JSON.stringify(data, null, 2),
  };
}
