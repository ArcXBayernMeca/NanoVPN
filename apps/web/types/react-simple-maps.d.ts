declare module "react-simple-maps" {
  import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

  export interface ComposableMapProps {
    projectionConfig?: Record<string, unknown>;
    style?: CSSProperties;
    children?: ReactNode;
  }
  export function ComposableMap(props: ComposableMapProps): JSX.Element;

  export interface GeographiesProps {
    geography: string | object;
    children: (args: { geographies: any[] }) => ReactNode;
  }
  export function Geographies(props: GeographiesProps): JSX.Element;

  export interface GeographyProps {
    key?: string;
    geography: any;
    fill?: string;
    stroke?: string;
    [key: string]: any;
  }
  export function Geography(props: GeographyProps): JSX.Element | null;

  export interface MarkerProps {
    coordinates: [number, number];
    onClick?: MouseEventHandler<SVGGElement>;
    children?: ReactNode;
  }
  export function Marker(props: MarkerProps): JSX.Element;
}
