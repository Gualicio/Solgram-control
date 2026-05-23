import { useMemo } from 'react';
import { useApp } from '../AppContext';
import { cn, formatNumber, formatDate } from '../lib/utils';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot
} from 'recharts';
import { Info } from 'lucide-react';

export default function AvanceCurve() {
  const { state } = useApp();
  const { scheduleData, dailyReports } = state;

  const chartData = useMemo(() => {
    if (!scheduleData) return [];

    const pStart = new Date(scheduleData.startDate || new Date().toISOString());
    const pEnd = new Date(scheduleData.endDate || new Date().toISOString());
    
    const days: Record<string, { date: string, planned: number, actual: number }> = {};
    
    let current = new Date(pStart);
    while (current <= pEnd) {
      const dStr = current.toISOString().slice(0, 10);
      days[dStr] = { date: dStr, planned: 0, actual: 0 };
      current.setDate(current.getDate() + 1);
    }

    let rawSumTotalTasksHrs = 0;
    scheduleData.tasks.forEach(tk => {
      if (!tk.isMilestone && tk.startDate && tk.endDate && tk.durationHrs > 0) {
        rawSumTotalTasksHrs += tk.durationHrs;
      }
    });

    const scaleFactor = (rawSumTotalTasksHrs > 0) ? (scheduleData.stats.sumTotalHrs / rawSumTotalTasksHrs) : 1;

    scheduleData.tasks.forEach(task => {
      if (!task.startDate || !task.endDate || task.durationHrs <= 0) return;
      
      const s = new Date(task.startDate);
      const e = new Date(task.endDate);
      const diffDays = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000));
      // Scale planned task hours appropriately using the calculated factor
      const hrsPerDay = (task.durationHrs * scaleFactor) / diffDays;
      
      let currTask = new Date(s);
      for (let i = 0; i < diffDays; i++) {
        const dStr = currTask.toISOString().slice(0, 10);
        if (days[dStr]) {
          days[dStr].planned += hrsPerDay;
        }
        currTask.setDate(currTask.getDate() + 1);
      }
    });

    dailyReports.forEach(report => {
      if (report.status === 'listo' && days[report.date]) {
        let matchedTask = null;
        if (report.taskId) {
           matchedTask = scheduleData.tasks.find(t => t.id === report.taskId);
        } else {
           matchedTask = scheduleData.tasks.find(t => t.name.trim().toLowerCase() === report.tipo?.trim().toLowerCase());
        }
        
        if (matchedTask && matchedTask.startDate && matchedTask.endDate && matchedTask.durationHrs > 0) {
           const s = new Date(matchedTask.startDate);
           const e = new Date(matchedTask.endDate);
           const diffDays = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000));
           const hrsPerDay = (matchedTask.durationHrs * scaleFactor) / diffDays;
           
           days[report.date].actual += hrsPerDay;
        }
      }
    });

    const sortedDays = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
    let cumPlanned = 0;
    let cumActual = 0;
    const today = new Date().toISOString().slice(0, 10);

    return sortedDays.map(d => {
      cumPlanned += d.planned;
      // Keep actual cumulative up to today
      if (d.date <= today) {
        cumActual += d.actual;
      }
      
      return {
        date: d.date,
        cumPlanned: Number(cumPlanned.toFixed(2)),
        cumActual: d.date <= today ? Number(cumActual.toFixed(2)) : undefined
      };
    });
  }, [scheduleData, dailyReports]);

  const stats = useMemo(() => {
    if (!scheduleData || chartData.length === 0) return { planPct: 0, realPct: 0, deviation: 0, daysLeft: 0, todayData: null };
    const total = scheduleData.stats.sumTotalHrs || 1;
    const today = new Date().toISOString().slice(0, 10);
    
    // Find closest data point to today
    const todayIndex = chartData.findIndex(d => d.date >= today);
    const todayData = todayIndex !== -1 ? chartData[todayIndex] : chartData[chartData.length - 1];
    
    const planAtDay = todayData?.cumPlanned || 0;
    const realAtDay = scheduleData.stats.sumActualHrs || 0;
    
    const planPct = (planAtDay / total) * 100;
    const realPct = (realAtDay / total) * 100;
    const deviation = realPct - planPct;

    const endDate = new Date(scheduleData.endDate);
    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000));

    return { planPct, realPct, deviation, daysLeft, todayData };
  }, [scheduleData, chartData, state.totalReportedHours]);

  if (!scheduleData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 opacity-50">
        <Info size={48} className="mb-4" />
        <h2 className={cn(
          "text-xl font-bold uppercase tracking-tight",
          state.theme === 'dark' ? "text-white" : "text-gray-900"
        )}>Sin Cronograma Activo</h2>
        <p className="text-xs text-gray-400">Cargue un archivo XER para generar la curva de avance.</p>
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full h-full flex flex-col font-sans select-none">
      {/* Header section matching Image 2 */}
      <div className="flex flex-col mb-6 px-2">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className={cn(
              "text-2xl font-black tracking-tight uppercase",
              state.theme === 'dark' ? "text-white" : "text-gray-900"
            )}>Curva S sincronizada</h2>
            <p className={cn(
              "text-[12px] font-medium",
              state.theme === 'dark' ? "text-gray-400" : "text-gray-500"
            )}>Cronograma P6 sincronizado con reportabilidad real de terreno.</p>
          </div>
          <div className={cn(
            "text-[11px] font-bold px-4 py-2 rounded-xl border uppercase tracking-widest",
            state.theme === 'dark' ? "text-gray-400 bg-white/5 border-white/10" : "text-gray-600 bg-gray-100 border-gray-200"
          )}>
            {formatDate(scheduleData.startDate)} → {formatDate(scheduleData.endDate)}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
          <div className="space-y-1 group transition-all">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">PLAN AL DÍA</span>
            <div className="text-3xl font-black text-green-500 font-mono tracking-tighter">
              {stats.planPct.toFixed(1)}<span className="text-xs ml-0.5">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">REAL EJECUTADO</span>
            <div className={cn(
              "text-3xl font-black font-mono tracking-tighter",
              state.theme === 'dark' ? "text-white" : "text-gray-900"
            )}>
              {stats.realPct.toFixed(1)}<span className="text-xs ml-0.5">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">DESVIACIÓN</span>
            <div className={cn("text-3xl font-black font-mono tracking-tighter", stats.deviation >= 0 ? "text-green-500" : "text-red-500")}>
              {stats.deviation >= 0 ? "+" : ""}{stats.deviation.toFixed(1)}<span className="text-xs ml-0.5 font-bold">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">DÍAS RESTANTES</span>
            <div className={cn(
              "text-3xl font-black font-mono tracking-tighter",
              state.theme === 'dark' ? "text-white" : "text-gray-900"
            )}>
              {stats.daysLeft}<span className="text-xs ml-1 font-bold">D</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full h-[400px] mt-4 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
            <defs>
              <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={state.theme === 'dark' ? "#ffffff" : "#000000"} 
              opacity={0.05} 
              vertical={true} 
            />
            <XAxis 
              dataKey="date" 
              stroke="#4b5563" 
              fontSize={10} 
              tickFormatter={(val) => {
                try {
                  const d = new Date(val + 'T00:00:00');
                  return d.toLocaleString('es-ES', { month: 'short', year: '2-digit' }).replace('.', '');
                } catch (e) {
                  return val;
                }
              }}
              interval="preserveStartEnd"
              minTickGap={30}
              tick={{ opacity: 0.8, fontWeight: 700, fill: '#9ca3af' }}
              axisLine={{ stroke: '#30363d' }}
              tickLine={false}
              dy={15}
            />
            <YAxis 
              stroke="#4b5563" 
              fontSize={10} 
              domain={[0, scheduleData.stats.sumTotalHrs || 'auto']}
              tickFormatter={(val) => {
                const total = scheduleData.stats.sumTotalHrs || 1;
                return `${Math.round((val / total) * 100)}%`;
              }}
              tick={{ opacity: 0.8, fontWeight: 700, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              dx={-10}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: state.theme === 'dark' ? '#0d1117' : '#ffffff', 
                border: state.theme === 'dark' ? '1px solid #30363d' : '1px solid #e5e7eb', 
                borderRadius: '12px', 
                boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.5)' 
              }}
              labelStyle={{ 
                color: state.theme === 'dark' ? '#fff' : '#111827', 
                fontWeight: '900', 
                fontSize: '11px', 
                marginBottom: '8px', 
                textTransform: 'uppercase', 
                letterSpacing: '0.05em' 
              }}
              itemStyle={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '800', padding: '2px 0' }}
              labelFormatter={(val) => formatDate(val)}
            />
            
            <ReferenceLine 
              x={todayStr} 
              stroke="#f59e0b" 
              strokeWidth={1}
              strokeDasharray="3 3"
              label={{ value: 'HOY', position: 'top', fill: '#f59e0b', fontSize: 10, fontWeight: 900 }} 
            />
            
            <Area 
              type="monotone" 
              dataKey="cumPlanned" 
              stroke="#3b82f6" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorPlanned)" 
              name="Plan"
              dot={false}
              activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }}
              isAnimationActive={true}
            />
            <Area 
              type="monotone" 
              dataKey="cumActual" 
              stroke="#10b981" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorActual)" 
              name="Real"
              dot={false}
              activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2, fill: '#fff' }}
              isAnimationActive={true}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
        
        {/* Footer Legend matching Image 2 */}
        <div className={cn(
          "flex gap-8 mt-6 px-4 py-3 rounded-2xl border inline-flex",
          state.theme === 'dark' ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-200"
        )}>
           <div className="flex items-center gap-3">
             <div className="w-6 h-1 bg-[#3b82f6] rounded-full" />
             <span className={cn(
               "text-[10px] font-black uppercase tracking-widest",
               state.theme === 'dark' ? "text-gray-400" : "text-gray-500"
             )}>Plan</span>
           </div>
           <div className="flex items-center gap-3">
             <div className="w-6 h-1 bg-[#10b981] rounded-full border-b border-dashed border-white/30" />
             <span className={cn(
               "text-[10px] font-black uppercase tracking-widest",
               state.theme === 'dark' ? "text-gray-400" : "text-gray-500"
             )}>Real</span>
           </div>
           <div className={cn(
             "flex items-center gap-3 border-l pl-8",
             state.theme === 'dark' ? "border-white/10" : "border-gray-200"
           )}>
             <div className="w-6 h-1 bg-[#f59e0b] rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
             <span className="text-[10px] font-black text-[#f59e0b] uppercase tracking-widest">Meta actual (HOY)</span>
           </div>
        </div>
      </div>
    );
}
