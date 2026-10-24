//+------------------------------------------------------------------+
//|                                        TRADORA_Connector.mq5      |
//|  Syncs this MT5 terminal's account + trades to TRADORA.           |
//|                                                                    |
//|  SETUP:                                                            |
//|  1. Tools -> Options -> Expert Advisors -> Allow WebRequest for    |
//|     listed URL, and add your TRADORA API URL there.                |
//|  2. Attach this EA to any chart.                                   |
//|  3. Paste the Connector Token from TRADORA (Account Details ->     |
//|     Connect MT5 -> Generate Connection Token).                     |
//|                                                                    |
//|  SECURITY: this EA holds ONLY the connector token — never your     |
//|  MT5 password, never a Supabase key. The token proves which one    |
//|  TRADORA account this terminal is allowed to update.               |
//+------------------------------------------------------------------+
#property copyright "TRADORA"
#property strict

input string InpConnectorToken   = "";                                    // Connector Token (from TRADORA)
input string InpApiUrl           = "https://YOUR-PROJECT.functions.supabase.co/mt5-sync"; // Edge Function URL
input int    InpSyncIntervalSecs = 45;                                    // Reconciliation interval (30-60s)

datetime g_lastSyncTime = 0;

//+------------------------------------------------------------------+
//| Build a stable idempotency key so retried requests never          |
//| duplicate an event server-side.                                   |
//+------------------------------------------------------------------+
string MakeRequestId(string prefix, long ticket)
{
   return prefix + "-" + IntegerToString(ticket) + "-" + IntegerToString((int)TimeCurrent());
}

//+------------------------------------------------------------------+
//| POST a JSON payload to the TRADORA Edge Function.                 |
//| Retries once on transient network failure.                        |
//+------------------------------------------------------------------+
bool PostToTradora(string jsonBody)
{
   string headers = "Content-Type: application/json\r\n";
   char   postData[];
   char   result[];
   string resultHeaders;

   StringToCharArray(jsonBody, postData, 0, StringLen(jsonBody));

   int attempt = 0;
   int status = -1;
   while(attempt < 2 && status <= 0)
   {
      ResetLastError();
      status = WebRequest("POST", InpApiUrl, headers, 5000, postData, result, resultHeaders);
      if(status <= 0)
      {
         Print("TRADORA sync failed (attempt ", attempt + 1, "), error ", GetLastError());
         Sleep(1000);
      }
      attempt++;
   }

   if(status != 200)
   {
      Print("TRADORA sync error, HTTP status: ", status, " body: ", CharArrayToString(result));
      return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| ACCOUNT_UPDATE — balance/equity snapshot.                         |
//+------------------------------------------------------------------+
void SendAccountUpdate()
{
   string json = "{"
      "\"token\":\"" + InpConnectorToken + "\","
      "\"event_type\":\"ACCOUNT_UPDATE\","
      "\"payload\":{"
         "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ","
         "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
      "}"
   "}";
   PostToTradora(json);
}

//+------------------------------------------------------------------+
//| TRADE_OPEN — a new position was opened.                           |
//+------------------------------------------------------------------+
void SendTradeOpen(ulong ticket)
{
   if(!PositionSelectByTicket(ticket)) return;

   string symbol    = PositionGetString(POSITION_SYMBOL);
   double volume    = PositionGetDouble(POSITION_VOLUME);
   double entry     = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl        = PositionGetDouble(POSITION_SL);
   double tp        = PositionGetDouble(POSITION_TP);
   long   posType   = PositionGetInteger(POSITION_TYPE);
   long   magic     = PositionGetInteger(POSITION_MAGIC);
   string direction = (posType == POSITION_TYPE_BUY) ? "BUY" : "SELL";

   string requestId = MakeRequestId("open", (long)ticket);

   string json = "{"
      "\"token\":\"" + InpConnectorToken + "\","
      "\"event_type\":\"TRADE_OPEN\","
      "\"request_id\":\"" + requestId + "\","
      "\"payload\":{"
         "\"ticket\":" + IntegerToString((long)ticket) + ","
         "\"positionId\":" + IntegerToString((long)ticket) + ","
         "\"symbol\":\"" + symbol + "\","
         "\"direction\":\"" + direction + "\","
         "\"volume\":" + DoubleToString(volume, 2) + ","
         "\"entry\":" + DoubleToString(entry, 5) + ","
         "\"sl\":" + DoubleToString(sl, 5) + ","
         "\"tp\":" + DoubleToString(tp, 5) + ","
         "\"magicNumber\":" + IntegerToString(magic) +
      "}"
   "}";
   PostToTradora(json);
}

//+------------------------------------------------------------------+
//| TRADE_CLOSE / TRADE_PARTIAL_CLOSE — a deal closed volume.          |
//+------------------------------------------------------------------+
void SendTradeClose(ulong ticket, double exitPrice, double profit, double commission, double swap, bool isPartial, double closedVolume)
{
   string requestId = MakeRequestId(isPartial ? "partial" : "close", (long)ticket);
   string eventType = isPartial ? "TRADE_PARTIAL_CLOSE" : "TRADE_CLOSE";

   string json = "{"
      "\"token\":\"" + InpConnectorToken + "\","
      "\"event_type\":\"" + eventType + "\","
      "\"request_id\":\"" + requestId + "\","
      "\"payload\":{"
         "\"ticket\":" + IntegerToString((long)ticket) + ","
         "\"exitPrice\":" + DoubleToString(exitPrice, 5) + ","
         "\"profit\":" + DoubleToString(profit, 2) + ","
         "\"commission\":" + DoubleToString(commission, 2) + ","
         "\"swap\":" + DoubleToString(swap, 2) + ","
         "\"closedVolume\":" + DoubleToString(closedVolume, 2) +
      "}"
   "}";
   PostToTradora(json);
}

//+------------------------------------------------------------------+
//| Expert initialization                                              |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(InpConnectorToken) == 0)
   {
      Alert("TRADORA_Connector: paste your Connector Token in the EA inputs.");
      return INIT_PARAMETERS_INCORRECT;
   }

   SendAccountUpdate();
   EventSetTimer(InpSyncIntervalSecs);
   Print("TRADORA_Connector initialized. Syncing every ", InpSyncIntervalSecs, "s.");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                            |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
}

//+------------------------------------------------------------------+
//| Event-driven sync: fires immediately on any trade transaction      |
//| (open, modify, partial close, full close) instead of waiting for   |
//| the next timer tick.                                               |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                         const MqlTradeRequest &request,
                         const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      ulong dealTicket = trans.deal;
      if(HistoryDealSelect(dealTicket))
      {
         long   entryType = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
         ulong  posId     = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
         double dealVolume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
         double dealPrice  = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
         double dealProfit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
         double dealComm   = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
         double dealSwap   = HistoryDealGetDouble(dealTicket, DEAL_SWAP);

         if(entryType == DEAL_ENTRY_IN)
         {
            // A new position was opened by this deal.
            SendTradeOpen(posId);
         }
         else if(entryType == DEAL_ENTRY_OUT || entryType == DEAL_ENTRY_OUT_BY)
         {
            // Determine if this was a full or partial close by checking
            // whether the position still exists with remaining volume.
            bool stillOpen = PositionSelectByTicket(posId);
            SendTradeClose(posId, dealPrice, dealProfit, dealComm, dealSwap, stillOpen, dealVolume);
         }
      }
      // Any deal changes balance/equity — push a fresh snapshot too.
      SendAccountUpdate();
   }
}

//+------------------------------------------------------------------+
//| Periodic reconciliation — recovers from missed events, EA          |
//| restarts, or internet loss between OnTradeTransaction calls.       |
//+------------------------------------------------------------------+
void OnTimer()
{
   SendAccountUpdate();

   // Re-send OPEN for every currently open position. The backend
   // upserts on (account_id, mt5_ticket), so this is safe to repeat —
   // it will never create a duplicate trade, only confirm the existing
   // one is still accurate.
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0) SendTradeOpen(ticket);
   }
}