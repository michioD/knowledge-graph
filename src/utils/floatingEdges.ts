import { Position, type InternalNode } from '@xyflow/react';

// this helper function returns the intersection point
// of the line between the center of the intersectionNode and the target node
function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
  const {
    width: intersectionNodeWidth,
    height: intersectionNodeHeight,
  } = intersectionNode.measured;
  
  const intersectionNodePosition = intersectionNode.internals.positionAbsolute;
  const targetPosition = targetNode.internals.positionAbsolute;

  const w = intersectionNodeWidth! / 2;
  const h = intersectionNodeHeight! / 2;

  const x2 = intersectionNodePosition.x + w;
  const y2 = intersectionNodePosition.y + h;
  const x1 = targetPosition.x + (targetNode.measured.width! / 2);
  const y1 = targetPosition.y + (targetNode.measured.height! / 2);

  // Is it a circle?
  const isCircle = intersectionNode.data?.expanded === false;

  if (isCircle) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // the radius of the circle is roughly w
    const radius = w;

    if (distance === 0) return { x: x2, y: y2 };

    return {
      x: x2 + (dx / distance) * radius,
      y: y2 + (dy / distance) * radius,
    };
  }

  // Rectangle intersection
  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  
  if (xx1 === 0 && yy1 === 0) return { x: x2, y: y2 };
  
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1));
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  
  return {
    x: w * (xx3 + yy3) + x2,
    y: h * (yy3 - xx3) + y2,
  };
}

// returns the position (top,right,bottom or right) passed node compared to the intersection point
function getEdgePosition(node: InternalNode, intersectionPoint: { x: number, y: number }) {
  const n = { ...node.internals.positionAbsolute, ...node.measured };
  const nx = Math.round(n.x);
  const ny = Math.round(n.y);
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + n.width! - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + n.height! - 1) return Position.Bottom;

  return Position.Top;
}

export function getEdgeParams(source: InternalNode, target: InternalNode) {
  const sourceIntersectionPoint = getNodeIntersection(source, target);
  const targetIntersectionPoint = getNodeIntersection(target, source);

  const sourcePos = getEdgePosition(source, sourceIntersectionPoint);
  const targetPos = getEdgePosition(target, targetIntersectionPoint);

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePos,
    targetPos,
  };
}
