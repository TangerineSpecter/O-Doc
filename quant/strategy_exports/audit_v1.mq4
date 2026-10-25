string QJson(string value) {
    string result="\"";
    for(int i=0;i<StringLen(value);i++) {
        ushort c=StringGetCharacter(value,i);
        if(c==34) result+="\\\"";
        else if(c==92) result+="\\\\";
        else if(c<32) result+=StringFormat("\\u%04x",(int)c);
        else result+=StringSubstr(value,i,1);
    }
    return result+"\"";
}
string QNum(double value) { return MathIsValidNumber(value) ? DoubleToString(value,16) : "unknown"; }
string QItem(string name,string value) { return "{\"name\":"+QJson(name)+",\"value\":"+QJson(value)+"}"; }
void QAudit() {
    int closed=0, remaining=0;
    for(int i=0;i<OrdersHistoryTotal();i++) if(OrderSelect(i,SELECT_BY_POS,MODE_HISTORY) && QOwned()) closed++;
    if(closed>2000) { Print("O-Doc audit exceeds 2000 trades; no truncated evidence produced"); return; }
    for(int i=0;i<OrdersTotal();i++) if(OrderSelect(i,SELECT_BY_POS,MODE_TRADES) && QOwned()) remaining++;
    string filename="odoc-"+QArtifactID+"-"+IntegerToString((int)TimeCurrent())+"-"+IntegerToString((int)GetTickCount())+".json";
    int file=FileOpen(filename,FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
    if(file==INVALID_HANDLE) { QError("audit file"); return; }
    string meta="{\"timezone\":\"\",\"currency\":"+QJson(AccountCurrency())+",\"initial_balance\":"+QJson(QNum(QInitialBalance))+",\"profit_basis\":\"gross\",\"cash_flow_coverage\":\"unknown\"}";
    FileWriteString(file,"{\"version\":1,\"metadata\":"+meta+",\"parameters\":"+QParameters()+",\"reported_metrics\":[");
    string facts=QItem("artifact_id",QArtifactID)+","+QItem("reference_request_id",QRequestID)+","+QItem("exporter_version",QExporterVersion);
    facts+=","+QItem("open_positions",IntegerToString(remaining))+","+QItem("native_errors",IntegerToString(QErrors));
    facts+=","+QItem("closed_trades",IntegerToString(closed))+","+QItem("entry_count",IntegerToString(QEntries));
    facts+=","+QItem("end_balance",QNum(AccountBalance()))+","+QItem("end_equity",QNum(AccountEquity()));
    facts+=","+QItem("terminal_build",IntegerToString((int)TerminalInfoInteger(TERMINAL_BUILD)))+","+QItem("symbol",Symbol())+","+QItem("period_minutes",IntegerToString(Period()));
    facts+=","+QItem("tick_model","unknown: attach native tester report")+","+QItem("verification","user_reported_native_test_not_authenticated_or_equivalent");
    FileWriteString(file,facts+"],\"records\":[");
    bool first=true;
    for(int i=0;i<OrdersHistoryTotal();i++) {
        if(!OrderSelect(i,SELECT_BY_POS,MODE_HISTORY) || !QOwned()) continue;
        if(!first) FileWriteString(file,","); first=false;
        string row="{\"kind\":\"trade\",\"id\":"+QJson("mt4-"+IntegerToString(OrderTicket()))+",\"timestamp\":"+QJson(TimeToString(OrderCloseTime(),TIME_DATE|TIME_SECONDS));
        row+=",\"symbol\":"+QJson(OrderSymbol())+",\"side\":"+QJson(OrderType()==OP_BUY ? "buy" : "sell")+",\"volume\":"+QJson(QNum(OrderLots()));
        row+=",\"profit\":"+QJson(QNum(OrderProfit()))+",\"profit_basis\":\"gross\",\"commission\":"+QJson(QNum(OrderCommission()))+",\"swap\":"+QJson(QNum(OrderSwap()));
        // Extra non-native fees are unknown, not silently declared zero.
        FileWriteString(file,row+"}");
    }
    FileWriteString(file,"]}"); FileClose(file);
    Print("O-Doc native observation saved in tester/files/",filename,"; server timezone, tick model and completeness require review");
}
double OnTester() {
    if(IsTesting() && !IsOptimization() && QInitialBalance>0) QAudit();
    return AccountBalance()-QInitialBalance;
}
