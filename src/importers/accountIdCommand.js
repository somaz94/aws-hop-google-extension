// Each script prints one importable `[profile]` block per AWS CLI profile whose account STS can read.
const SCRIPTS = Object.freeze({
  posix: [
    'for p in $(aws configure list-profiles); do',
    '  id=$(aws sts get-caller-identity --profile "$p" --query Account --output text 2>/dev/null) || continue',
    `  printf '[profile %s]\\naws_account_id = %s\\n\\n' "$p" "$id"`,
    'done',
  ],
  powershell: [
    'aws configure list-profiles | ForEach-Object {',
    '  $id = aws sts get-caller-identity --profile $_ --query Account --output text 2>$null',
    '  if ($LASTEXITCODE -eq 0) { "[profile $_]`naws_account_id = $id`n" }',
    '}',
  ],
});

/**
 * Terminals the import helper writes the command for. A new one is one entry: `os` lists the
 * `chrome.runtime.getPlatformInfo()` values it is the default for, and `clipboard` is the command
 * the output is piped into, or null to print it.
 */
export const CLI_SHELLS = Object.freeze([
  { id: 'macos', label: 'options.cliHelper.shell.macos', terminal: 'options.cliHelper.terminal.macos', os: ['mac'], syntax: 'posix', clipboard: 'pbcopy' },
  { id: 'windows', label: 'options.cliHelper.shell.windows', terminal: 'options.cliHelper.terminal.windows', os: ['win'], syntax: 'powershell', clipboard: 'Set-Clipboard' },
  { id: 'linux', label: 'options.cliHelper.shell.linux', terminal: 'options.cliHelper.terminal.linux', os: ['linux', 'cros', 'openbsd', 'fuchsia'], syntax: 'posix', clipboard: null },
]);

const FALLBACK = 'linux';

export function getShell(id) {
  return CLI_SHELLS.find((shell) => shell.id === id) ?? CLI_SHELLS.find((shell) => shell.id === FALLBACK);
}

/** The shell whose `os` lists `os`, else the POSIX one that prints. */
export function shellForPlatform(os) {
  return CLI_SHELLS.find((shell) => shell.os.includes(os)) ?? getShell(FALLBACK);
}

export function accountIdCommand(shellId) {
  const shell = getShell(shellId);
  const lines = [...SCRIPTS[shell.syntax]];
  if (shell.clipboard) lines[lines.length - 1] += ` | ${shell.clipboard}`;
  return lines.join('\n');
}
