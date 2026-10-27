import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { accountIdCommand, CLI_SHELLS, getShell, shellForPlatform } from '../src/importers/accountIdCommand.js';
import { importProfiles } from '../src/importers/index.js';
import { LANGUAGES, catalog } from '../src/i18n/index.js';

// Every profile but `expired` resolves to one account, so only `shop` should import.
const RUNNERS = {
  posix: {
    interpreters: [['bash', ['-c']], ['zsh', ['-c']]],
    fakes: (clipboard) => [
      'aws() {',
      `  if [ "$1" = configure ]; then printf 'default\\nshop\\nterraform-shop\\nexpired\\n'; return; fi`,
      '  case "$4" in default|shop|terraform-shop) echo 111122223333 ;; *) return 255 ;; esac',
      '}',
      clipboard ? `${clipboard}() { cat; }` : '',
    ],
  },
  powershell: {
    interpreters: [['pwsh', ['-NoProfile', '-NonInteractive', '-Command']]],
    fakes: (clipboard) => [
      'function aws {',
      `  if ($args[0] -eq 'configure') { 'default', 'shop', 'terraform-shop', 'expired'; return }`,
      `  if ($args[3] -in 'default', 'shop', 'terraform-shop') { $global:LASTEXITCODE = 0; '111122223333' } else { $global:LASTEXITCODE = 255 }`,
      '}',
      clipboard ? `function ${clipboard} { process { $_ } }` : '',
    ],
  },
};

function run(shell, interpreter, args) {
  const script = [...RUNNERS[shell.syntax].fakes(shell.clipboard), accountIdCommand(shell.id)].join('\n');
  try {
    return execFileSync(interpreter, [...args, script], { encoding: 'utf8' });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

describe('CLI_SHELLS', () => {
  test('ids are unique and no platform defaults to two shells', () => {
    const ids = CLI_SHELLS.map((shell) => shell.id);
    const platforms = CLI_SHELLS.flatMap((shell) => shell.os);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(platforms).size).toBe(platforms.length);
  });

  test.each(CLI_SHELLS.map((shell) => [shell.id, shell]))('%s has its labels in every catalog and a runner here', (id, shell) => {
    for (const language of LANGUAGES) {
      expect(catalog(language)).toHaveProperty([shell.label]);
      expect(catalog(language)).toHaveProperty([shell.terminal]);
    }
    expect(RUNNERS).toHaveProperty(shell.syntax);
  });
});

describe('shellForPlatform', () => {
  test.each([
    ['mac', 'macos'],
    ['win', 'windows'],
    ['linux', 'linux'],
    ['cros', 'linux'],
    ['android', 'linux'],
    [undefined, 'linux'],
  ])('%s gets %s', (os, id) => {
    expect(shellForPlatform(os).id).toBe(id);
  });

  test('an unknown id falls back to the printing POSIX shell', () => {
    expect(getShell('beos')).toMatchObject({ id: 'linux', syntax: 'posix', clipboard: null });
  });
});

describe('accountIdCommand', () => {
  test('macOS loops in POSIX shell and pipes into pbcopy', () => {
    expect(accountIdCommand('macos').split('\n')).toEqual([
      'for p in $(aws configure list-profiles); do',
      '  id=$(aws sts get-caller-identity --profile "$p" --query Account --output text 2>/dev/null) || continue',
      `  printf '[profile %s]\\naws_account_id = %s\\n\\n' "$p" "$id"`,
      'done | pbcopy',
    ]);
  });

  test('Windows loops in PowerShell and pipes into Set-Clipboard', () => {
    expect(accountIdCommand('windows').split('\n')).toEqual([
      'aws configure list-profiles | ForEach-Object {',
      '  $id = aws sts get-caller-identity --profile $_ --query Account --output text 2>$null',
      '  if ($LASTEXITCODE -eq 0) { "[profile $_]`naws_account_id = $id`n" }',
      '} | Set-Clipboard',
    ]);
  });

  test('Linux prints instead of copying', () => {
    expect(accountIdCommand('linux')).toBe(accountIdCommand('macos').replace(/ \| pbcopy$/, ''));
  });

  const cases = CLI_SHELLS.flatMap((shell) => RUNNERS[shell.syntax].interpreters.map(([interpreter, args]) => [shell.id, interpreter, shell, args]));

  test.each(cases)('%s output from %s imports as one account per target', (id, interpreter, shell, args) => {
    const output = run(shell, interpreter, args);
    if (output === null) return;
    for (const text of [output, output.replace(/\n/g, '\r\n')]) {
      const { profiles, skipped } = importProfiles(text, { idFactory: () => 'id' });
      expect(profiles.map((p) => [p.name, p.fields.account])).toEqual([['shop', '111122223333']]);
      expect(skipped.map((s) => s.name)).toEqual(['default', 'terraform-shop']);
    }
  }, 30000);
});
