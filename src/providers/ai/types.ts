export interface AiProvider {
  generateStructuredJson(input: {
    system: string;
    user: string;
  }): Promise<unknown>;
}
