import Image from "next/image";
import logo from "../../public/images/logo.png";

/** Official Telangana Against Oral Cancer logo (wordmark). Sits on a white chip in dark mode. */
export function Logo({ height = 44, priority = false }: { height?: number; priority?: boolean }) {
  return (
    <span className="logo-chip">
      <Image src={logo} alt="Telangana Against Oral Cancer" height={height} style={{ width: "auto", height }} priority={priority} sizes={`${Math.round((height * logo.width) / logo.height)}px`} />
    </span>
  );
}
