export class Guardrails {
  #spent = 0;
  #count = 0;
  constructor(
    private readonly budgetMicroUsd: number,
    private readonly pricePerRequestMicroUsd: number,
    private readonly maxRequests = 25,
  ) {}
  canSpend(): boolean {
    return this.#count < this.maxRequests && this.#spent + this.pricePerRequestMicroUsd <= this.budgetMicroUsd;
  }
  record(amountMicroUsd: number): void { this.#spent += amountMicroUsd; this.#count += 1; }
  get spentMicroUsd(): number { return this.#spent; }
  get requestCount(): number { return this.#count; }
}
