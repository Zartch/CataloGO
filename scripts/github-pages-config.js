function ensureTrailingSlash(value) {
  if (!value || value === '/') {
    return '/';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function resolveGitHubPagesBasePath({
  explicitBasePath = process.env.VITE_APP_BASE_PATH,
  repository = process.env.GITHUB_REPOSITORY,
} = {}) {
  if (explicitBasePath) {
    return ensureTrailingSlash(explicitBasePath);
  }

  if (!repository) {
    return '/';
  }

  const [owner, repoName] = repository.split('/');
  if (!owner || !repoName) {
    return '/';
  }

  return repoName.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? '/'
    : ensureTrailingSlash(repoName);
}

export function resolveRouterMode({
  explicitRouterMode = process.env.VITE_ROUTER_MODE,
  deployTarget = process.env.VITE_DEPLOY_TARGET,
} = {}) {
  if (explicitRouterMode) {
    return explicitRouterMode;
  }

  return deployTarget === 'github-pages' ? 'hash' : 'browser';
}
