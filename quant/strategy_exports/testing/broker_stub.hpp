// Synthetic API doubles for emitted control flow. This is NOT MetaEditor or MT4.
#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <string>
#include <vector>
using string=std::string; using datetime=long long; using ushort=unsigned short;
constexpr int OP_BUY=0,OP_SELL=1,SELECT_BY_TICKET=1,SELECT_BY_POS=2,MODE_TRADES=0,MODE_HISTORY=1;
constexpr int SYMBOL_TRADE_TICK_SIZE=1,SYMBOL_TRADE_TICK_VALUE=2,SYMBOL_VOLUME_STEP=3,SYMBOL_VOLUME_MIN=4,SYMBOL_VOLUME_MAX=5;
constexpr int INIT_FAILED=-1,INIT_PARAMETERS_INCORRECT=-2,INIT_SUCCEEDED=0,clrNONE=0,FILE_WRITE=1,FILE_TXT=2,FILE_ANSI=4,CP_UTF8=65001,INVALID_HANDLE=-1,TIME_DATE=1,TIME_SECONDS=2,TERMINAL_BUILD=3;
constexpr double EMPTY_VALUE=2147483647.;
#define input
struct MqlRates { double open,high,low,close; };
struct Deal {int ticket,magic,side;double lots,entry,exit,profit;bool closed=false;};
std::vector<Deal> deals; Deal* selected=nullptr;
std::vector<MqlRates> history;
bool testing=true; double Bid=100,Ask=100.1,balance=1000; datetime clockTime=946684800;
string fileName; std::ofstream output;
bool IsTesting(){return testing;} bool IsOptimization(){return false;}
string Symbol(){return "SYNTHETIC";} int Period(){return 1440;} datetime TimeCurrent(){return clockTime;}
int GetLastError(){return 0;} int GetTickCount(){return 1;} int TerminalInfoInteger(int){return 1400;}
int StringLen(const string&s){return s.size();} ushort StringGetCharacter(const string&s,int i){return (unsigned char)s[i];}
string StringSubstr(const string&s,int i,int n){return s.substr(i,n);} string IntegerToString(int n){return std::to_string(n);}
string DoubleToString(double v,int n){char b[400];std::snprintf(b,sizeof(b),"%.*f",n,v);return b;}
string StringFormat(const char*f,int v){char b[100];std::snprintf(b,sizeof(b),f,v);return b;}
int StringCompare(const string&a,const string&b,bool){return a.compare(b);}
string TimeToString(datetime,int){return "2024.01.02 00:00:00";}
bool MathIsValidNumber(double v){return std::isfinite(v);} double MathMin(double a,double b){return std::min(a,b);} double MathMax(double a,double b){return std::max(a,b);}
double MathAbs(double v){return std::abs(v);} double MathSqrt(double v){return std::sqrt(v);} double MathLog(double v){return std::log(v);} double MathFloor(double v){return std::floor(v);}
double NormalizeDouble(double v,int n){double p=std::pow(10,n);return std::round(v*p)/p;}
template<class...T>void Print(T...){ } template<class T>void ArraySetAsSeries(std::vector<T>&,bool){}
template<class T>void ArrayResize(std::vector<T>&a,int n){a.resize(n);} template<class T>void ArrayInitialize(std::vector<T>&a,T v){std::fill(a.begin(),a.end(),v);}
int CopyRates(string,int,int,int,std::vector<MqlRates>&r){r=history;return r.size();}
datetime iTime(string,int,int){return clockTime;} int iBarShift(string,int,datetime,bool){return 1;}
void RefreshRates(){} double AccountBalance(){return balance;} double AccountEquity(){return balance;} string AccountCurrency(){return "USD";}
double AccountFreeMarginCheck(string,int,double){return 100000;}
double SymbolInfoDouble(string,int key){return key==1?.01:key==2?1:key==3||key==4?.01:100;}
int OrdersTotal(){return std::count_if(deals.begin(),deals.end(),[](const Deal&d){return !d.closed;});}
int OrdersHistoryTotal(){return deals.size()-OrdersTotal();}
bool OrderSelect(int id,int by,int mode=MODE_TRADES){selected=nullptr;int seen=0;for(auto&d:deals){if(by==SELECT_BY_TICKET?d.ticket==id:(d.closed==(mode==MODE_HISTORY)&&seen++==id)){selected=&d;return true;}}return false;}
string OrderSymbol(){return Symbol();} int OrderMagicNumber(){return selected->magic;} int OrderType(){return selected->side;}
datetime OrderCloseTime(){return selected->closed?clockTime:0;} double OrderOpenPrice(){return selected->entry;} double OrderLots(){return selected->lots;}
int OrderTicket(){return selected->ticket;} double OrderProfit(){return selected->profit;} double OrderCommission(){return -.25;} double OrderSwap(){return -.01;}
int OrderSend(string,int side,double lots,double price,int,double,double,string,int magic,datetime,int){deals.push_back({int(deals.size()+1),magic,side,lots,price,0,0,false});return deals.back().ticket;}
bool OrderClose(int ticket,double,double price,int,int){for(auto&d:deals)if(d.ticket==ticket&&!d.closed){d.closed=true;d.exit=price;d.profit=(d.side==OP_BUY?1:-1)*(price-d.entry)*d.lots*100;balance+=d.profit-.26;return true;}return false;}
int FileOpen(string name,int,int,int){fileName=name;output.open(name);return output?1:INVALID_HANDLE;}
void FileWriteString(int,const string&s){output<<s;} void FileClose(int){output.close();}
