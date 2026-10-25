#property strict
input int Fast = 5;
input int Slow = 20;
input double Lots = 0.1;
input int Slippage = 3;
input int Magic = 731;
void OnTick() {
    if(OrdersTotal() != 0) return;
    double f = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0);
    double s = iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0);
    if(f > s)
        OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);
}
