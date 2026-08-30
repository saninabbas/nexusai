export interface RiskCloseState {
  active_stop_client_id: string | null;
  active_take_profit_client_id: string | null;
}

export interface RiskCloseOrder {
  orderId: number;
  clientOrderId: string;
  avgPrice: string;
  executedQty: string;
  status: string;
}

export interface RiskCloseClient {
  emergencyClose(input: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: string;
    clientOrderId: string;
  }): Promise<RiskCloseOrder>;
  cancelAlgoOrder(symbol: string, clientAlgoId: string): Promise<void>;
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown cancellation failure").slice(0, 300);
}

function alreadyGone(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return [-2011, -2013].includes(Number((error as { code?: number }).code || 0));
}

export async function executeRiskReducingClose(input: {
  client: RiskCloseClient;
  state: RiskCloseState;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: string;
  clientOrderId: string;
}): Promise<{ closeOrder: RiskCloseOrder; cancellationErrors: string[] }> {
  // Never remove exchange protection until the reduce-only close is acknowledged.
  const closeOrder = await input.client.emergencyClose({
    symbol: input.symbol,
    side: input.side,
    quantity: input.quantity,
    clientOrderId: input.clientOrderId,
  });
  const ids = [...new Set([
    input.state.active_stop_client_id,
    input.state.active_take_profit_client_id,
  ].filter((value): value is string => Boolean(value)))];
  const cancellationErrors: string[] = [];
  for (const clientAlgoId of ids) {
    try {
      await input.client.cancelAlgoOrder(input.symbol, clientAlgoId);
    } catch (error) {
      if (!alreadyGone(error)) cancellationErrors.push(`${clientAlgoId}: ${message(error)}`);
    }
  }
  return { closeOrder, cancellationErrors };
}
