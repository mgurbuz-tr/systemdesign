interface Props {
  color: string;
  label: string;
}

/**
 * Tek bir kullanıcı işaretçisinin görseli: ok + altında etiket.
 * Hem `UsernameModal` (statik preview) hem `CursorOverlay` (motion ile sarılı)
 * tarafından kullanılır — tutarlı bir aesthetic için tek noktada tutuluyor.
 */
export function CursorMarker({ color, label }: Props) {
  return (
    <div className="flex flex-col items-start" style={{ pointerEvents: 'none' }}>
      <svg
        width={20}
        height={20}
        viewBox="0 0 20 20"
        fill="none"
        style={{
          filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))',
          transform: 'translate(-2px, -2px)',
        }}
      >
        <path
          d="M3 2.2 L17 9.4 L10.6 11.4 L8.6 17.8 Z"
          fill={color}
          stroke="#fff"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="mt-[1px] inline-block max-w-[160px] truncate rounded-[6px] px-1.5 py-[2px] text-[10.5px] font-semibold tracking-[0.005em] text-white"
        style={{
          background: color,
          boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
          marginLeft: 6,
        }}
      >
        {label}
      </span>
    </div>
  );
}
