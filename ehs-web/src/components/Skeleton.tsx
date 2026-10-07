// 화면을 불러오는 동안 바로 보여 주는 뼈대 (메뉴 클릭 즉시 표시)
export function PageSkeleton({ header = true, rows = 6 }: { header?: boolean; rows?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="불러오는 중">
      {header && (
        <div className="-mx-3 -mt-3 mb-3 border-b border-gray-200 bg-white px-3 pt-3 pb-4 sm:-mx-4 sm:-mt-4 sm:mb-4 sm:px-4 lg:-mx-6 lg:-mt-6 lg:mb-6 lg:px-6">
          <div className="h-3 w-40 rounded bg-gray-200" />
          <div className="mt-3 h-6 w-56 rounded bg-gray-200" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4 h-4 w-32 rounded bg-gray-200" />
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-9 rounded bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
