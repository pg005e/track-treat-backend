import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

@Injectable()
export class LlmService {
  private readonly client: Groq | null;
  private readonly model: string;
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('groq.apiKey');
    if (apiKey) {
      this.client = new Groq({ apiKey });
      this.logger.log('Groq client initialized');
    } else {
      this.client = null;
      this.logger.warn(
        'GROQ_API_KEY not set — LLM features (meal plan generation, AI feedback) are disabled',
      );
    }
    this.model = this.config.get<string>('groq.model') || 'llama-3.3-70b-versatile';
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Send a prompt and get back structured JSON via tool use.
   * Forces the model to call a function with the given parameters schema,
   * then extracts and returns the function arguments as typed data.
   */
  async chatJson<T>(options: {
    systemPrompt: string;
    userPrompt: string;
    toolName: string;
    toolDescription: string;
    inputSchema: Record<string, unknown>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<T> {
    if (!this.client) {
      throw new HttpException(
        'AI features are not configured. Set GROQ_API_KEY to enable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const maxRetries = 2;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.3,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: options.toolName,
                description: options.toolDescription,
                parameters: options.inputSchema,
              },
            },
          ],
          tool_choice: {
            type: 'function',
            function: { name: options.toolName },
          },
        });

        const message = response.choices[0]?.message;
        const toolCall = message?.tool_calls?.[0];

        if (!toolCall || toolCall.function.name !== options.toolName) {
          throw new Error('Model did not return the expected tool call');
        }

        return JSON.parse(toolCall.function.arguments) as T;
      } catch (error) {
        lastError = error;

        // Retry on rate limit or server errors
        if (
          error instanceof Groq.RateLimitError ||
          error instanceof Groq.InternalServerError
        ) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `Groq API error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${error.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Non-retryable errors
        break;
      }
    }

    this.logger.error(
      `Groq API call failed after ${maxRetries + 1} attempts`,
      lastError instanceof Error ? lastError.stack : String(lastError),
    );

    throw new HttpException(
      'AI service temporarily unavailable',
      HttpStatus.BAD_GATEWAY,
    );
  }
}
