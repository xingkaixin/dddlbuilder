import { createElement, useCallback } from 'react';
import { attachTilePlayer } from '@ddlbuilder/design/tile-player';
import { TILE_SCENES, type TileScene } from '@ddlbuilder/design/tile-scenes';
import '@ddlbuilder/design/tiles.css';
import { cn } from '@/lib/utils';
import { Ink } from './sketch';

interface FeatureTileProps {
  scene: TileScene;
  title: string;
  description: string;
  compact?: boolean;
  order?: number;
  href?: string;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}

export function FeatureTile({
  scene,
  title,
  description,
  compact,
  order = 0,
  href,
  onClick,
}: FeatureTileProps) {
  const { art, glyph } = TILE_SCENES[scene];
  const element = href ? 'a' : onClick ? 'button' : 'div';
  const attach = useCallback((node: HTMLElement) => attachTilePlayer(node, order), [order]);

  return createElement(
    element,
    {
      ref: attach,
      className: cn('tile', compact && 'tile--compact'),
      href,
      type: element === 'button' ? 'button' : undefined,
      onClick,
    },
    <span className="tile__chip" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path pathLength={1} d={glyph} />
      </svg>
    </span>,
    // TILE_SCENES is a static constant shipped with the design package.
    <span className="tile__art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art }} />,
    <span className="tile__text">
      <span className="tile__title">{title}</span>
      <span className="tile__desc">{description}</span>
    </span>,
  );
}

export function EmptyTile({
  scene,
  title,
  description,
  href,
  onClick,
}: Pick<FeatureTileProps, 'scene' | 'title' | 'description' | 'href' | 'onClick'>) {
  return (
    <div className="lm-sketch tile-frame relative mx-auto w-full max-w-[360px]">
      <Ink radius={8} />
      <FeatureTile
        compact
        scene={scene}
        title={title}
        description={description}
        href={href}
        onClick={onClick}
      />
    </div>
  );
}
