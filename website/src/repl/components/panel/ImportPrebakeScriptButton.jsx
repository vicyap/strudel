import { errorLogger } from '@strudel/core';
import { useSettings, storePrebakeScript } from '../../../settings.mjs';
import { SpecialActionInput } from '../button/action-button';
import { confirmDialog, PREBAKE_CHANGE_MSG } from '@src/repl/util.mjs';
import { DocumentArrowDownIcon } from '@heroicons/react/16/solid';

async function importScript(script, updateEditor) {
  const reader = new FileReader();
  reader.readAsText(script);

  reader.onload = () => {
    const text = reader.result;
    storePrebakeScript(text);
    updateEditor && updateEditor(text);
  };

  reader.onerror = () => {
    errorLogger(new Error('failed to import prebake script'), 'importScript');
  };
}

export async function exportScript(script) {
  const blob = new Blob([script], { type: 'application/javascript' });
  const downloadLink = document.createElement('a');
  downloadLink.href = window.URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];
  downloadLink.download = `prebake_${date}.strudel`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

export function ImportPrebakeScriptButton({ updateEditor }) {
  const settings = useSettings();

  return (
    <SpecialActionInput
      type="file"
      label="import"
      accept=".strudel,.js"
      onChange={async (e) => {
        const file = e.target.files[0];
        const confirmed = await confirmDialog(PREBAKE_CHANGE_MSG);
        if (!confirmed) {
          return;
        }
        try {
          await importScript(file, updateEditor);
        } catch (e) {
          errorLogger(e);
        }
      }}
    />
  );
}
