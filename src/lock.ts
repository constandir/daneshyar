import { updateSetting, useStore } from './store';

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(pin: string | null) {
  if (pin === null) {
    await updateSetting('pinHash', null);
    await updateSetting('pinSalt', null);
    return;
  }
  const salt = crypto.getRandomValues(new Uint32Array(2)).join('-');
  await updateSetting('pinSalt', salt);
  await updateSetting('pinHash', await sha(salt + ':' + pin));
}

export async function verifyPin(pin: string, salt: string, hash: string) {
  return (await sha(salt + ':' + pin)) === hash;
}

export const useHasPin = () => !!useStore().settings.pinHash;
