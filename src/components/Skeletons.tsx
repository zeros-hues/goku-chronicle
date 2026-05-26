'use client';

function SkeletonBlock({ w, h, radius = 6, style = {} }: {
  w?: string | number; h: number; radius?: number; style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{ width: w ?? '100%', height: h, borderRadius: radius, flexShrink: 0, ...style }}
    />
  );
}

export function TimesheetSkeleton() {
  return (
    <div style={{ padding: '20px 32px 80px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {[80, 90, 100, 80, 96].map((w, i) => (
          <SkeletonBlock key={i} w={w} h={30} radius={999} />
        ))}
        <div style={{ flex: 1 }} />
        <SkeletonBlock w={120} h={30} radius={999} />
      </div>
      {/* Table */}
      <div style={{ border: '1px solid var(--paper-edge)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 12, padding: '10px 16px', background: 'var(--paper-tint)', borderBottom: '1px solid var(--paper-edge)' }}>
          {[60, 44, 160, 300, 44, 44, 60].map((w, i) => (
            <SkeletonBlock key={i} w={w} h={10} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 9 }, (_, row) => (
          <div key={row} style={{
            display: 'flex', gap: 12, padding: '13px 16px', alignItems: 'center',
            borderBottom: row < 8 ? '1px dashed var(--paper-rule)' : undefined,
          }}>
            <SkeletonBlock w={16} h={16} radius={3} />
            <SkeletonBlock w={52} h={11} />
            <SkeletonBlock w={36} h={12} />
            <SkeletonBlock w={100 + (row % 3) * 24} h={22} radius={999} />
            <SkeletonBlock w={`${30 + (row % 4) * 10}%`} h={11} />
            <SkeletonBlock w={36} h={11} />
            <SkeletonBlock w={36} h={11} />
            <SkeletonBlock w={48} h={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div style={{ padding: '20px 32px 80px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Range chips */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[64, 78, 90, 86, 70].map((w, i) => (
          <SkeletonBlock key={i} w={w} h={28} radius={999} />
        ))}
      </div>
      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 88, borderRadius: 12 }} />
        ))}
      </div>
      {/* Two-col row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      </div>
      {/* Chart */}
      <div className="skeleton" style={{ height: 256, borderRadius: 12 }} />
      {/* Bottom two-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="skeleton" style={{ height: 180, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 180, borderRadius: 12 }} />
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div style={{ padding: '20px 32px 80px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SkeletonBlock w={240} h={24} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <SkeletonBlock w={28} h={28} radius={50} />
            <SkeletonBlock w={160 + i * 20} h={13} />
            <div style={{ flex: 1 }} />
            <SkeletonBlock w={70} h={28} radius={6} />
            <SkeletonBlock w={28} h={28} radius={6} />
          </div>
        ))}
      </div>
    </div>
  );
}
