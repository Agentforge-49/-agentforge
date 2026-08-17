const STAGE_DEFINITIONS = [
  { key:'account', label:'Secure your workspace', detail:'Your authenticated workspace is ready.', path:'/settings' },
  { key:'connection', label:'Connect a business tool', detail:'Add an encrypted credential or consent-based account.', path:'/apps' },
  { key:'build', label:'Publish an automation', detail:'Publish an agent and activate its workflow.', path:'/studio' },
  { key:'first_run', label:'Complete the first run', detail:'Run the workflow once and inspect the result.', path:'/runs' },
  { key:'human_review', label:'Prove human control', detail:'Resolve one approval request before expanding access.', path:'/approvals' },
  { key:'quality', label:'Add a quality gate', detail:'Create an evaluation suite with repeatable cases.', path:'/evaluations' },
  { key:'recovery', label:'Verify recovery', detail:'Create and dry-run a secret-free recovery snapshot.', path:'/launch' },
];

export function buildActivationSummary(input = {}) {
  const counts = {
    connections:number(input.connections),
    published_agents:number(input.publishedAgents),
    active_workflows:number(input.activeWorkflows),
    total_runs:number(input.totalRuns),
    resolved_approvals:number(input.resolvedApprovals),
    pending_approvals:number(input.pendingApprovals),
    quality_suites:number(input.qualitySuites),
    verified_recoveries:number(input.verifiedRecoveries),
  };
  const firstRunAt = timestamp(input.firstRunAt);
  const profileAt = timestamp(input.profileCreatedAt);
  const readiness = {
    account:Boolean(profileAt),
    connection:counts.connections > 0,
    build:counts.published_agents > 0 && counts.active_workflows > 0,
    first_run:counts.total_runs > 0,
    human_review:counts.resolved_approvals > 0,
    quality:counts.quality_suites > 0,
    recovery:counts.verified_recoveries > 0,
  };
  const stages = STAGE_DEFINITIONS.map(stage => ({ ...stage, ready:readiness[stage.key] }));
  const completed = stages.filter(stage => stage.ready).length;
  const recentStatuses = Array.isArray(input.recentRunStatuses) ? input.recentRunStatuses : [];
  const terminal = recentStatuses.filter(status => ['succeeded', 'failed', 'cancelled'].includes(status));
  const succeeded = terminal.filter(status => status === 'succeeded').length;
  const timeToValue = firstRunAt && profileAt && firstRunAt >= profileAt
    ? Math.round((firstRunAt - profileAt) / 60000)
    : null;

  return {
    completed,
    total:stages.length,
    percentage:Math.round((completed / stages.length) * 100),
    activated:readiness.build && readiness.first_run,
    current_stage:stages.find(stage => !stage.ready) || null,
    stages,
    time_to_first_value_minutes:timeToValue,
    signals:{
      ...counts,
      runs_30d:recentStatuses.length,
      success_rate:terminal.length ? Math.round((succeeded / terminal.length) * 100) : null,
    },
    privacy:{
      source:'workspace resource metadata',
      content_collected:false,
      secrets_collected:false,
      note:'Calculated from user-owned counts, statuses, and timestamps. Prompt and message content is not read.',
    },
  };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function timestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}
