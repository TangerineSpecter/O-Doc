#property strict
#property indicator_chart_window
#property indicator_buffers 1
input int Period = 14;
extern bool ShowSignal = true;
double Buffer[];
int OnInit() { SetIndexBuffer(0, Buffer); return(INIT_SUCCEEDED); }
int OnCalculate(const int rates_total, const int prev_calculated,
                const datetime &time[], const double &open[], const double &high[],
                const double &low[], const double &close[], const long &tick_volume[],
                const long &volume[], const int &spread[]) {
    Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;
    return(rates_total);
}
