export interface MapPoint {
  id: string;
  kind: "incident" | "FIRE" | "POLICE" | "AMBULANCE" | "hospital";
  latitude: number;
  longitude: number;
  label: string;
  sublabel?: string;
  /** Override marker color (e.g. incident severity). */
  color?: string;
  highlighted?: boolean;
  dimmed?: boolean;
  /** Points the map should frame. */
  focus?: boolean;
  selectable?: boolean;
  /** Draw a GPS accuracy circle of this radius (metres). */
  accuracyM?: number;
}

export interface MapLine {
  id: string;
  from: [number, number];
  to: [number, number];
  /** Road path; when present it is drawn instead of the straight from→to segment. */
  path?: [number, number][] | null;
  color: string;
  dashed?: boolean;
}

export interface MapViewProps {
  points: MapPoint[];
  lines?: MapLine[];
  dark?: boolean;
  /** Changing this value re-frames the map. */
  focusKey?: string;
  onSelect?: (id: string) => void;
  className?: string;
}
