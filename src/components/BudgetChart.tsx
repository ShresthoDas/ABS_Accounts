"use client";

interface BudgetChartProps {
  title: string;
  projected: number;
  actual: number;
  type: 'expense' | 'income';
}

export default function BudgetChart({ title, projected, actual, type }: BudgetChartProps) {
  const percentage = projected > 0 ? Math.round((actual / projected) * 100) : 0;
  
  const getExpenseColor = (pct: number): { fill: string; bg: string; text: string; bar: string } => {
    if (pct > 100) return { fill: 'bg-red-500', bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-600' };
    if (pct >= 80) return { fill: 'bg-amber-500', bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-600' };
    if (pct >= 50) return { fill: 'bg-green-500', bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-600' };
    return { fill: 'bg-blue-500', bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-600' };
  };

  const getIncomeColor = (pct: number): { fill: string; bg: string; text: string; bar: string } => {
    if (pct > 100) return { fill: 'bg-green-500', bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-600' };
    if (pct >= 80) return { fill: 'bg-blue-500', bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-600' };
    if (pct >= 50) return { fill: 'bg-amber-500', bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-600' };
    return { fill: 'bg-red-500', bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-600' };
  };

  const colors = type === 'expense' ? getExpenseColor(percentage) : getIncomeColor(percentage);

  // Determine zone labels and thresholds for the gradient bar background
  const zoneConfig = type === 'expense'
    ? [
        { label: '50%', color: 'bg-blue-200', width: '50%', start: 0 },
        { label: '80%', color: 'bg-green-200', width: '30%', start: 50 },
        { label: '100%', color: 'bg-amber-200', width: '20%', start: 80 },
        { label: '>100%', color: 'bg-red-200', width: '0%', start: 100, isOver: true },
      ]
    : [
        { label: '50%', color: 'bg-red-200', width: '50%', start: 0 },
        { label: '80%', color: 'bg-amber-200', width: '30%', start: 50 },
        { label: '100%', color: 'bg-blue-200', width: '20%', start: 80 },
        { label: '>100%', color: 'bg-green-200', width: '0%', start: 100, isOver: true },
      ];

  return (
    <div className="border rounded-lg p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.text} ${colors.bg}`}>
          {percentage}%
        </span>
      </div>

      {/* Amounts row */}
      <div className="flex justify-between items-baseline mb-2">
        <div>
          <span className="text-lg font-bold text-gray-800">
            ₹ {actual.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-gray-500 ml-1">actual</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-medium text-gray-600">
            ₹ {projected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-gray-500 ml-1">projected</span>
        </div>
      </div>

      {/* Zone legend */}
      <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-400"></span> {'<'}50%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-400"></span> 50-80%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400"></span> 80-100%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-400"></span> {'>'}100%
        </span>
      </div>

      {/* Bar chart */}
      <div className="relative w-full h-7 bg-gray-100 rounded-full overflow-hidden">
        {/* Zone backgrounds */}
        {type === 'expense' ? (
          <>
            <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(to right, #93c5fd, #93c5fd 50%, #86efac 50%, #86efac 80%, #fde68a 80%, #fde68a 100%)' }}></div>
            <div className="absolute top-0 right-0 h-full bg-red-200" style={{ width: '0%' }}></div>
          </>
        ) : (
          <>
            <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(to right, #fca5a5, #fca5a5 50%, #fde68a 50%, #fde68a 80%, #93c5fd 80%, #93c5fd 100%)' }}></div>
            <div className="absolute top-0 right-0 h-full bg-green-200" style={{ width: '0%' }}></div>
          </>
        )}

        {/* Actual fill bar */}
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out ${colors.bar} opacity-85`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>

        {/* Over-budget/over-target indicator */}
        {percentage > 100 && (
          <div
            className={`absolute top-0 h-full rounded-r-full ${type === 'expense' ? 'bg-red-500' : 'bg-green-500'} opacity-85`}
            style={{
              left: '100%',
              right: 0,
              width: `${Math.min((percentage - 100) * 0.5, 20)}%`,
              minWidth: '8px',
              maxWidth: '40px',
            }}
          ></div>
        )}

        {/* Percentage label on bar */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-white drop-shadow-sm">
            {percentage}%
          </span>
        </div>
      </div>

      {/* Status message */}
      <div className="mt-2 text-xs">
        {type === 'expense' ? (
          percentage > 100 ? (
            <span className="text-red-600 font-medium">⚠ {percentage - 100}% over budget!</span>
          ) : percentage >= 80 ? (
            <span className="text-amber-600 font-medium">⚠ Approaching budget limit</span>
          ) : percentage >= 50 ? (
            <span className="text-green-600">✓ On track, within budget</span>
          ) : (
            <span className="text-blue-600">✓ Well under budget</span>
          )
        ) : (
          percentage > 100 ? (
            <span className="text-green-600 font-medium">✓ {percentage - 100}% above target!</span>
          ) : percentage >= 80 ? (
            <span className="text-blue-600 font-medium">✓ Near target, good progress</span>
          ) : percentage >= 50 ? (
            <span className="text-amber-600">⚠ Moderate progress toward target</span>
          ) : (
            <span className="text-red-600">⚠ Low progress toward target</span>
          )
        )}
      </div>
    </div>
  );
}