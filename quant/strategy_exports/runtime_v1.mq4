// Strategy Tester only. Native ticks/lots/costs are not local-reference fills.
int QTicket=-1, QEntries=0, QStep=0, QEntryStep=0, QNextEntryStep=0, QErrors=0;
datetime QLastBar=0;
bool QBlockEntries=false, QExitPending=false;
double QInitialBalance=0;

void QError(string action) { QErrors++; Print("O-Doc ",action," error=",GetLastError()); }
bool QOwned() { return OrderSymbol()==Symbol() && OrderMagicNumber()==QMagic && (OrderType()==OP_BUY || OrderType()==OP_SELL); }
bool QSelected() {
    if(QTicket<0) return false;
    if(!OrderSelect(QTicket,SELECT_BY_TICKET)) { QError("select"); QBlockEntries=true; return false; }
    if(!QOwned()) { QBlockEntries=true; return false; }
    return OrderCloseTime()==0;
}
int QSide() { return QSelected() ? (OrderType()==OP_BUY ? 1 : -1) : 0; }
void QObserveClose() {
    if(QTicket>=0 && !QSelected() && !QBlockEntries) {
        QTicket=-1; QNextEntryStep=QStep+QCooldownBars+1;
    }
}
bool QClose(string reason) {
    if(!QSelected()) return false;
    RefreshRates();
    double price=OrderType()==OP_BUY ? Bid : Ask;
    if(!OrderClose(QTicket,OrderLots(),price,QMaxDeviationPoints,clrNONE)) {
        QError("close "+reason); QBlockEntries=true; QExitPending=true; return false;
    }
    Print("O-Doc close ",QTicket," reason=",reason);
    QTicket=-1; QExitPending=false; QNextEntryStep=QStep+QCooldownBars+1;
    return true;
}
bool QProtect() {
    if(!QSelected()) return false;
    double entry=OrderOpenPrice(), price=OrderType()==OP_BUY ? Bid : Ask;
    int side=OrderType()==OP_BUY ? 1 : -1;
    double stop=entry*(1-side*QStopLoss), profit=entry*(1+side*QTakeProfit);
    if(QStopLoss>0 && (side==1 ? price<=stop : price>=stop)) { QClose("tick_stop_loss"); return true; }
    if(QTakeProfit>0 && (side==1 ? price>=profit : price<=profit)) { QClose("tick_take_profit"); return true; }
    return false;
}
int QTarget(double signal,int current) {
    if(!QValid(signal)) return 0;
    if(QBooleanSignal) return signal==1 ? QBooleanSide : 0;
    if(current==1 && signal>QLongExit) return QDirection==0 && signal<QShortEntry ? -1 : 1;
    if(current==-1 && signal<QShortExit) return QDirection==0 && signal>QLongEntry ? 1 : -1;
    if(QDirection!=-1 && signal>QLongEntry) return 1;
    if(QDirection!=1 && signal<QShortEntry) return -1;
    return 0;
}
void QOpen(int side) {
    if(QBlockEntries || QEntries>=QMaxEntries || QStep<QNextEntryStep || QTicket>=0) return;
    RefreshRates();
    double price=side==1 ? Ask : Bid;
    double tick=SymbolInfoDouble(Symbol(),SYMBOL_TRADE_TICK_SIZE);
    double value=SymbolInfoDouble(Symbol(),SYMBOL_TRADE_TICK_VALUE);
    double step=SymbolInfoDouble(Symbol(),SYMBOL_VOLUME_STEP);
    double minimum=SymbolInfoDouble(Symbol(),SYMBOL_VOLUME_MIN), maximum=SymbolInfoDouble(Symbol(),SYMBOL_VOLUME_MAX);
    if(price<=0 || tick<=0 || value<=0 || step<=0 || minimum<=0 || maximum<minimum) { QError("unknown contract sizing"); QBlockEntries=true; return; }
    // Linear tick-value notional proxy, rounded DOWN. Currency/contract behavior needs native validation.
    double target=AccountEquity()*QPositionFraction/(price*value/tick);
    double lots=NormalizeDouble(MathFloor(MathMin(target,maximum)/step)*step,8);
    if(lots<minimum || lots<=0) { Print("O-Doc skip: target below minimum lot; no upward rounding"); return; }
    int command=side==1 ? OP_BUY : OP_SELL;
    if(AccountFreeMarginCheck(Symbol(),command,lots)<=0) { QError("insufficient margin"); return; }
    int ticket=OrderSend(Symbol(),command,lots,price,QMaxDeviationPoints,0,0,"O-Doc tester candidate",QMagic,0,clrNONE);
    if(ticket<0) { QError("open"); return; }
    QTicket=ticket; QEntries++; QEntryStep=QStep;
    Print("O-Doc open ",ticket," side=",side," lots=",lots);
    QProtect(); // Spread may already cross a very narrow software stop.
}
int OnInit() {
    if(!IsTesting() || IsOptimization()) { Print("O-Doc: a single Strategy Tester run is required; live/demo and optimizer are disabled"); return INIT_FAILED; }
    if(!QSignalInputsValid()) return INIT_PARAMETERS_INCORRECT;
    if(QExpectedSymbol=="" || QExpectedSymbol!=Symbol() || QExpectedPeriod<=0 || QExpectedPeriod!=Period()) { Print("O-Doc: explicitly map expected symbol and timeframe"); return INIT_PARAMETERS_INCORRECT; }
    if(OrdersTotal()!=0 || QMagic<=0 || QMaxDeviationPoints<0 || QMaxDeviationPoints>1000) return INIT_PARAMETERS_INCORRECT;
    if((QDirection!=1 && QDirection!=-1 && QDirection!=0) || (QBooleanSide!=1 && QBooleanSide!=-1)) return INIT_PARAMETERS_INCORRECT;
    if((QDirection==1 && QBooleanSide!=1) || (QDirection==-1 && QBooleanSide!=-1)) return INIT_PARAMETERS_INCORRECT;
    if(QPositionFraction<=0 || QPositionFraction>1 || QStopLoss<0 || QStopLoss>=1 || QTakeProfit<0 || QTakeProfit>=10) return INIT_PARAMETERS_INCORRECT;
    if(QDirection!=1 && QTakeProfit>=1) return INIT_PARAMETERS_INCORRECT;
    if((QDirection!=-1 && QLongExit>QLongEntry) || (QDirection!=1 && QShortEntry>QShortExit) || (QDirection==0 && QShortEntry>=QLongEntry)) return INIT_PARAMETERS_INCORRECT;
    if(QMaxHoldingBars<0 || QMaxHoldingBars>2000 || QCooldownBars<0 || QCooldownBars>2000 || QMaxEntries<1 || QMaxEntries>2000 || (QSameOpenReversal && QCooldownBars!=0)) return INIT_PARAMETERS_INCORRECT;
    QInitialBalance=AccountBalance(); QLastBar=iTime(Symbol(),Period(),0);
    if(QInitialBalance<=0 || QLastBar<=0) return INIT_FAILED;
    // First attached bar is skipped; the next NEW bar supplies a complete previous close.
    return INIT_SUCCEEDED;
}
void OnTick() {
    if(!IsTesting() || IsOptimization()) return;
    datetime now=iTime(Symbol(),Period(),0);
    if(now<=0) { QBlockEntries=true; return; }
    bool fresh=now!=QLastBar;
    if(fresh) {
        int elapsed=iBarShift(Symbol(),Period(),QLastBar,true);
        if(elapsed<1) { QBlockEntries=true; QErrors++; elapsed=1; }
        QStep+=elapsed; QLastBar=now;
    }
    QObserveClose();
    if(QExitPending) { QClose("retry_pending_exit"); return; }
    if(AccountEquity()<=0) { QBlockEntries=true; if(QSelected()) QClose("equity_exhausted"); return; }
    if(QProtect()) return;
    if(!fresh) return;
    if(QMaxHoldingBars>0 && QSelected() && QStep-QEntryStep>=QMaxHoldingBars) { QClose("max_holding"); return; }
    double signal=QClosedSignal();
    int current=QSide(), target=QTarget(signal,current);
    if(current!=0 && target!=current) {
        bool reversing=target!=0;
        if(!QClose(QValid(signal) ? "signal_change" : "missing_signal")) return;
        if(reversing && QSameOpenReversal && !QBlockEntries) QNextEntryStep=QStep;
        else return;
    }
    if(target!=0 && !QBlockEntries) QOpen(target);
}
