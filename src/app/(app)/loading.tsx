export default function Loading() {
  return (
    <div className="animate-pulse pt-safe" role="status" aria-label="Loading">
      <div className="h-14" />
      <div className="mt-4 h-8 w-48 rounded-xl bg-surface-2" />
      <div className="mt-3 h-4 w-64 rounded-lg bg-surface-2" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-3xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
