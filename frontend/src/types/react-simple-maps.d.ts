// Type declaration for react-simple-maps (no @types package available)
declare module 'react-simple-maps' {
  import { ReactNode, ComponentType } from 'react';

  export interface ProjectionConfig {
    scale?: number;
    center?: [number, number];
    rotate?: [number, number, number];
    parallels?: [number, number];
    precision?: number;
  }

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: ProjectionConfig;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    className?: string;
    children?: ReactNode;
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (params: { geographies: any[] }) => ReactNode;
  }

  export interface GeographyProps {
    key?: string;
    geography: any;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
    onMouseMove?: (event: React.MouseEvent) => void;
    onMouseLeave?: (event: React.MouseEvent) => void;
    onClick?: (event: React.MouseEvent) => void;
    className?: string;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const Marker: ComponentType<any>;
  export const Line: ComponentType<any>;
  export const ZoomableGroup: ComponentType<any>;
  export const Sphere: ComponentType<any>;
  export const Graticule: ComponentType<any>;
}
