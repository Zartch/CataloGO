export function resolveGitHubPagesBasePath(options?: {
  explicitBasePath?: string | undefined;
  repository?: string | undefined;
}): string;

export function resolveRouterMode(options?: {
  explicitRouterMode?: string | undefined;
  deployTarget?: string | undefined;
}): string;
