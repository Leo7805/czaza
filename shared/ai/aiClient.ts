export type AiClient = {
  complete(prompt: string): Promise<string>;
};
