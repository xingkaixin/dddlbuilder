import i18n from '@/i18n';
import { executeBusinessDataTask, type BusinessDataReply, type BusinessDataTask } from './tasks';

self.onmessage = async (event: MessageEvent<{ task: BusinessDataTask; locale: string }>) => {
  let reply: BusinessDataReply;

  try {
    await i18n.changeLanguage(event.data.locale);
    reply = { output: await executeBusinessDataTask(event.data.task) };
  } catch (cause) {
    reply = { error: cause instanceof Error ? cause.message : 'dataImport.errors.read' };
  }

  self.postMessage(reply);
};
