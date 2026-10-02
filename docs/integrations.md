# Integrations

FPG is a release gate, not a deployer. It plugs into systems that already know how to run checks: a CI job, a Kubernetes Job behind an Argo Rollouts analysis, or a small HTTP endpoint behind a Flagger webhook. FPG ships no server and no controller of its own.

## Remote baseline storage

Baselines default to `visual.baselineDir` inside the repository, which grows the repo as screenshots accumulate. `visual.remoteSync` delegates storage to an external sync tool:

```yaml
visual:
  baselineDir: ./visual-baselines
  remoteSync:
    pull: { command: aws, args: [s3, sync, s3://example-bucket/fpg-baselines, ./visual-baselines] }
    push: { command: aws, args: [s3, sync, ./visual-baselines, s3://example-bucket/fpg-baselines, --delete] }
```

`fpg baseline pull` and `fpg baseline push` run the configured entries as `command` plus `args` array from the project root, with no shell in between. A non-zero exit aborts the command and prints a redacted stderr summary. The same shape works for other tools, for example `rclone sync remote:fpg-baselines ./visual-baselines` or `gsutil -m rsync -r gs://example-bucket/fpg-baselines ./visual-baselines`.

Typical order in a release job:

```bash
fpg baseline pull     # fetch baselines before comparing
fpg verify            # audit plus compare against the pulled baselines
fpg baseline update   # only on the branch that owns the baselines
fpg baseline push     # publish refreshed baselines
```

## GitHub Actions

The composite action accepts `command: baseline-pull` and `command: baseline-push` in addition to the existing commands, and forwards `--github` while `github: "true"` (the default). Under that flag, `fpg verify` appends a Job Summary (result, route x viewport table, diff ratios, evidence path), writes `result=passed|failed` and `diffRatio` to `$GITHUB_OUTPUT`, and prints one `::error` annotation per failed route or check. When the `GITHUB_STEP_SUMMARY` and `GITHUB_OUTPUT` environment files are absent, the flag degrades to a log line and writes nothing.

```yaml
name: release-gate
on:
  pull_request:
    branches: [main]
jobs:
  fpg:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build && (npm run preview &)
      - uses: Reality-JH/frontend-promotion-guard@v0.3.0
        id: gate
        with:
          command: verify
          config: fpg.yml
      - run: echo "result=${{ steps.gate.outputs.result }} diffRatio=${{ steps.gate.outputs.diffRatio }}"
        if: always()
```

Mark the job as a required status check in branch protection so merges wait for the gate. `verify` needs a Chrome or Edge binary; `ubuntu-latest` runners ship one at `/usr/bin/google-chrome`.

## Argo Rollouts

The AnalysisRun job provider runs `fpg verify` as a Kubernetes Job. Job completion maps to a successful measurement; a non-zero exit fails the analysis and the rollout aborts or rolls back according to the canary strategy.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: fpg-verify
spec:
  args:
    - name: candidate-url
  provider:
    job:
      spec:
        backoffLimit: 0
        template:
          spec:
            restartPolicy: Never
            containers:
              - name: fpg
                image: registry.example.com/fpg:0.3.0
                command:
                  - fpg
                  - verify
                  - --config
                  - /etc/fpg/fpg.yml
                  - --base-url
                  - "{{args.candidate-url}}"
                volumeMounts:
                  - name: fpg-config
                    mountPath: /etc/fpg
            volumes:
              - name: fpg-config
                configMap:
                  name: fpg-config
```

Reference the template from the canary steps of a Rollout:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: storefront
spec:
  replicas: 3
  selector:
    matchLabels:
      app: storefront
  template:
    metadata:
      labels:
        app: storefront
    spec:
      containers:
        - name: storefront
          image: registry.example.com/storefront:stable
          ports:
            - containerPort: 8080
  strategy:
    canary:
      steps:
        - setWeight: 20
        - pause:
            duration: 30
        - analysis:
            templates:
              - templateName: fpg-verify
            args:
              - name: candidate-url
                value: http://storefront-canary:8080
        - setWeight: 50
```

The Job image must contain the `fpg` CLI and a Chrome or Chromium binary, for example `npm install -g frontend-promotion-guard` on a Node 20 base plus a browser. Baselines can be baked into the image, mounted from a volume, or fetched with `fpg baseline pull` in the same container before `verify` runs.

## Flagger

Flagger gates rollout stages through webhooks: it POSTs canary metadata to `url` and proceeds only on an HTTP 2xx response. FPG does not provide an HTTP server, so the webhook target is a carrier you operate. Two workable carriers:

- A small runner endpoint you own. On `pre-rollout` it creates a Kubernetes Job that runs `fpg verify` and answers 2xx only after the Job succeeds. On `confirm-promotion` it answers 2xx when the recorded gate result is passing and non-2xx while a run is still in flight, which keeps the promotion gate closed until the check finishes. Keep `timeout` above the expected Job runtime, or answer early and let the next analysis tick retry.
- A CI dispatch endpoint such as a `repository_dispatch`-triggered workflow or a Tekton trigger. The pipeline runs `fpg verify`, and a thin shim translates the pipeline status into the HTTP response Flagger expects.

```yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: storefront
  namespace: shop
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: storefront
  service:
    port: 80
  analysis:
    interval: 30s
    threshold: 5
    webhooks:
      - name: fpg-pre-rollout
        type: pre-rollout
        url: http://fpg-runner.tooling.svc:8080/pre-rollout
        timeout: 60s
        metadata:
          config: /etc/fpg/fpg.yml
      - name: fpg-confirm-promotion
        type: confirm-promotion
        url: http://fpg-runner.tooling.svc:8080/confirm-promotion
        timeout: 60s
```

Flagger POSTs a JSON body containing `name`, `namespace`, `phase`, and the webhook `metadata` map. The runner maps that to `fpg verify --config <path>` against the canary URL. Whether `fpg` runs inside the runner process, inside a Job, or inside a CI pipeline is the carrier's decision; the HTTP request and response are the only contract FPG relies on.
