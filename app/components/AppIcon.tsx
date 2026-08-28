export function AppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#7C3AED" />
      <path
        d="M9 21.5V10.5C9 9.94772 9.44772 9.5 10 9.5H18.5L23 14V21.5C23 22.0523 22.5523 22.5 22 22.5H10C9.44772 22.5 9 22.0523 9 21.5Z"
        stroke="white"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M18.3 9.5V13.7C18.3 13.9761 18.5239 14.2 18.8 14.2H23" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12.2 17.3h5.4M12.2 19.6h3.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
