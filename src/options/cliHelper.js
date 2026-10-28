import { richText } from '../i18n/dom.js';
import { t } from '../i18n/index.js';
import { accountIdCommand, CLI_SHELLS, getShell, shellForPlatform } from '../importers/accountIdCommand.js';
import { $, element } from './dom.js';

/** The "Get account IDs from your AWS CLI profiles" helper, with a command per shell. */
export function createCliHelper() {
  let shell = shellForPlatform(null);

  function render() {
    $('cli-shells').replaceChildren(...CLI_SHELLS.map((candidate) => {
      const button = element('button', '', t(candidate.label));
      button.type = 'button';
      button.dataset.shell = candidate.id;
      button.setAttribute('aria-pressed', String(candidate.id === shell.id));
      return button;
    }));
    $('cli-helper-step1').replaceChildren(richText(document, t('options.cliHelper.step1', { terminal: t(shell.terminal) })));
    $('cli-helper-step2').replaceChildren(richText(document, t(shell.clipboard ? 'options.cliHelper.step2.clipboard' : 'options.cliHelper.step2.print')));
    $('cli-helper-step3').replaceChildren(richText(document, t('options.cliHelper.step3', { button: t('options.merge') })));
    $('cli-command').textContent = accountIdCommand(shell.id);
  }

  $('cli-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('cli-command').textContent);
    $('cli-copy').textContent = t('options.cliHelper.copied');
    setTimeout(() => { $('cli-copy').textContent = t('options.cliHelper.copy'); }, 1500);
  });

  $('cli-shells').addEventListener('click', (event) => {
    const id = event.target.closest('button')?.dataset.shell;
    if (!id) return;
    shell = getShell(id);
    render();
  });

  return {
    render,
    setPlatform(os) {
      shell = shellForPlatform(os);
    },
  };
}
