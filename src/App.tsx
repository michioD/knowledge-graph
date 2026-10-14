import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import type { Connection, Edge, NodeTypes, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import MathNode from './MathNode';
import type { MathNodeData } from './MathNode';
import { v4 as uuidv4 } from 'uuid';
import { Undo, Redo, Eraser, Hand, LassoSelect, Loader2 } from 'lucide-react';
import FloatingEdge from './FloatingEdge';

import dagre from 'dagre';

const nodeTypes: NodeTypes = {
  math: MathNode,
};

const edgeTypes = {
  floating: FloatingEdge,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction });

  const nodeWidth = 400;
  const nodeHeight = 300;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });
};



type HistoryState = {
  nodes: Node[];
  edges: Edge[];
};

function AppContent() {
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    fetch('http://localhost:8080/api/graph')
      .then(res => res.json())
      .then(data => {
        if (data.nodes && data.nodes.length > 0) {
          setNodes(data.nodes);
          const loadedEdges = data.edges || [];
          setEdges(loadedEdges.map((e: any) => ({ ...e, animated: false })));
        } else {
          setNodes([]);
          setEdges([]);
        }
        setIsLoaded(true);
      })
      .catch(err => {
        console.error("Failed to load from backend", err);
        setNodes([]);
        setEdges([]);
        setIsLoaded(true);
      });
  }, [setNodes, setEdges]);

  const saveToDatabase = async (currentNodes: Node[], currentEdges: Edge[]) => {
    setSaveStatus('Saving...');
    try {
      const res = await fetch('http://localhost:8080/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: currentNodes, edges: currentEdges }),
      });
      if (res.ok) {
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus('Error saving');
      }
    } catch (err) {
      setSaveStatus('Error saving');
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    const timeoutId = setTimeout(() => {
      saveToDatabase(nodes, edges);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, isLoaded]);

  // History State
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  const takeSnapshot = useCallback(() => {
    setPast((p) => {
      const last = p[p.length - 1];
      if (last && last.nodes === nodesRef.current && last.edges === edgesRef.current) {
        return p;
      }
      return [...p, { nodes: nodesRef.current, edges: edgesRef.current }];
    });
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([{ nodes: nodesRef.current, edges: edgesRef.current }, ...future]);
    
    const currentExpandedMap = new Map(nodesRef.current.map(n => [n.id, n.data.expanded]));
    const nextNodes = previous.nodes.map(n => ({
      ...n,
      data: { ...n.data, expanded: currentExpandedMap.get(n.id) ?? n.data.expanded }
    }));

    setNodes(nextNodes as Node[]);
    setEdges(previous.edges);
  }, [past, future, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, { nodes: nodesRef.current, edges: edgesRef.current }]);
    
    const currentExpandedMap = new Map(nodesRef.current.map(n => [n.id, n.data.expanded]));
    const nextNodes = next.nodes.map(n => ({
      ...n,
      data: { ...n.data, expanded: currentExpandedMap.get(n.id) ?? n.data.expanded }
    }));

    setNodes(nextNodes as Node[]);
    setEdges(next.edges);
  }, [past, future, setNodes, setEdges]);

  // UI Modes
  const [toolMode, setToolMode] = useState<'pan' | 'lasso' | 'eraser'>('pan');
  const [isMouseDown, setIsMouseDown] = useState(false);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only track left clicks
      setIsMouseDown(true);
      if (toolMode === 'eraser') {
        takeSnapshot();
      }
    };
    const up = () => setIsMouseDown(false);
    window.addEventListener('mousedown', down, { capture: true });
    window.addEventListener('mouseup', up, { capture: true });
    return () => {
      window.removeEventListener('mousedown', down, { capture: true });
      window.removeEventListener('mouseup', up, { capture: true });
    };
  }, [toolMode, takeSnapshot]);

  // Form State
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');
  const [nodeType, setNodeType] = useState<'definition' | 'theorem' | 'axiom'>('definition');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const onConnect = useCallback((params: Edge | Connection) => {
    takeSnapshot();
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges, takeSnapshot]);

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      setEditingNodeId(node.id);
      setLabel(node.data.label as string);
      setContent(node.data.content as string);
      setNodeType(node.data.type as 'definition' | 'theorem' | 'axiom');
    },
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (toolMode === 'eraser') {
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
      return;
    }
    setNodes((nds) => nds.map((n) => {
      if (n.id === node.id) {
        return { ...n, data: { ...n.data, expanded: !n.data.expanded } };
      }
      return n;
    }));
  }, [toolMode, setNodes, setEdges]);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (toolMode === 'eraser') {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    }
  }, [toolMode, setEdges]);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (toolMode === 'eraser' && isMouseDown) {
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
    }
  }, [toolMode, isMouseDown, setNodes, setEdges]);

  const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (toolMode === 'eraser' && isMouseDown) {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    }
  }, [toolMode, isMouseDown, setEdges]);

  const saveNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !content.trim()) return;

    takeSnapshot();
    
    if (editingNodeId) {
      setNodes(nds => nds.map(n => {
        if (n.id === editingNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              label,
              content,
              type: nodeType,
            }
          };
        }
        return n;
      }));
      setEditingNodeId(null);
    } else {
      // Add node to the center of the screen
      // Taking into account the sidebar width (320px) by calculating the center of the React Flow canvas
      const sidebarWidth = 320;
      const canvasWidth = window.innerWidth - sidebarWidth;
      const x = sidebarWidth + canvasWidth / 2;
      const y = window.innerHeight / 2;
      const centerPosition = screenToFlowPosition({ x, y });
      
      const newNode = {
        id: uuidv4(),
        type: 'math',
        position: centerPosition,
        data: {
          label,
          content,
          type: nodeType,
          expanded: false,
        } as MathNodeData,
      };
      setNodes((nds) => [...nds, newNode]);
    }

    setLabel('');
    setContent('');
  };

  const toggleAllNodes = () => {
    takeSnapshot();
    const anyExpanded = nodes.some(n => n.data.expanded);
    const willExpand = !anyExpanded;
    
    if (willExpand) {
      const newNodesState = nodes.map(n => ({
        ...n,
        data: { ...n.data, expanded: true, originalPosition: { ...n.position } }
      }));
      const layoutedNodes = getLayoutedElements(newNodesState, edges);
      setNodes(layoutedNodes);
    } else {
      setNodes(nds => nds.map(n => {
        const originalPosition = n.data.originalPosition as { x: number, y: number } | undefined;
        const position = originalPosition || n.position;
        const data = { ...n.data, expanded: false };
        delete (data as any).originalPosition;
        return { ...n, position, data };
      }));
    }
  };

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  if (!isLoaded) {
    return <div className="flex h-screen w-screen items-center justify-center bg-gray-50 text-gray-500 font-medium">Loading knowledge graph...</div>;
  }

  return (
    <div className="flex h-screen w-screen bg-gray-50">
      {/* Sidebar for Input */}
      <div className="w-80 bg-white shadow-xl flex flex-col z-10">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-800">Knowledge Graph</h1>
              <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                {saveStatus === 'Saving...' && <Loader2 className="animate-spin w-3 h-3" />}
                {saveStatus}
              </span>
            </div>
            <div className="flex gap-1">
              <button 
                onClick={undo} 
                disabled={past.length === 0}
                className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Undo (Cmd+Z)"
              >
                <Undo size={18} />
              </button>
              <button 
                onClick={redo}
                disabled={future.length === 0}
                className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Redo (Cmd+Shift+Z)"
              >
                <Redo size={18} />
              </button>
            </div>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-md mb-6 gap-1">
            <button
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-2 rounded-sm text-sm font-medium transition-colors ${toolMode === 'pan' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}
              onClick={() => setToolMode('pan')}
              title="Pan (Drag to move canvas)"
            >
              <Hand size={16} /> Pan
            </button>
            <button
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-2 rounded-sm text-sm font-medium transition-colors ${toolMode === 'lasso' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}
              onClick={() => setToolMode('lasso')}
              title="Lasso (Drag to select nodes)"
            >
              <LassoSelect size={16} /> Lasso
            </button>
            <button
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-2 rounded-sm text-sm font-medium transition-colors ${toolMode === 'eraser' ? 'bg-white shadow-sm text-red-600' : 'text-gray-600 hover:bg-gray-200'}`}
              onClick={() => setToolMode('eraser')}
              title="Erase (Click or drag to delete)"
            >
              <Eraser size={16} /> Erase
            </button>
          </div>
          
          <form onSubmit={saveNode} className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-gray-800 -mb-2">
              {editingNodeId ? 'Edit Node' : 'Add New Node'}
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <div className="flex bg-gray-100 p-1 rounded-md gap-1">
                <button
                  type="button"
                  className={`flex-1 py-1 px-1 rounded-sm text-xs font-medium transition-colors ${nodeType === 'definition' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => setNodeType('definition')}
                >
                  Def
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1 px-1 rounded-sm text-xs font-medium transition-colors ${nodeType === 'theorem' ? 'bg-red-500 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => setNodeType('theorem')}
                >
                  Theorem
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1 px-1 rounded-sm text-xs font-medium transition-colors ${nodeType === 'axiom' ? 'bg-green-500 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => setNodeType('axiom')}
                >
                  Axiom
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name / Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Pythagorean Theorem"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content (LaTeX supported)</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 h-32 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                placeholder="In a right angled triangle: $$a^2 + b^2 = c^2$$"
                required
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-gray-800 text-white py-2 rounded-md hover:bg-gray-900 transition-colors font-medium"
              >
                {editingNodeId ? 'Save Changes' : 'Add Node'}
              </button>
              {editingNodeId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingNodeId(null);
                    setLabel('');
                    setContent('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-md hover:bg-gray-400 transition-colors font-medium"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={toggleAllNodes}
              className="w-full bg-gray-100 text-gray-700 py-2 rounded-md hover:bg-gray-200 transition-colors font-medium text-sm"
            >
              {nodes.some(n => n.data.expanded) ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-500">
          <p className="font-semibold text-gray-700">How to use:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Pan Tool:</strong> Drag canvas to move around.</li>\n            <li><strong>Lasso Tool:</strong> Drag canvas to lasso select multiple nodes.</li>
            <li><strong>Eraser Tool:</strong> Click and drag over nodes/edges to erase them instantly!</li>
            <li>Right-click a node to edit its content</li>
            <li>Use <code>$$...$$</code> for block equations</li>
            <li>Use <code>$...$</code> for inline equations</li>
          </ul>
        </div>
      </div>

      {/* Graph Area */}
      <div 
        className="flex-1 relative" 
        style={{ cursor: toolMode === 'eraser' ? 'crosshair' : (toolMode === 'pan' ? 'grab' : 'default') }}
      >
        {/* Legend */}
        <div className="absolute top-4 right-4 bg-white/90 p-2 rounded shadow-sm border border-gray-200 z-10 text-xs pointer-events-none">
          <h3 className="font-bold text-gray-700 mb-1 border-b pb-1">Legend</h3>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm border border-white"></div>
              <span className="text-gray-600 font-medium">Definition</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm border border-white"></div>
              <span className="text-gray-600 font-medium">Theorem</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm border border-white"></div>
              <span className="text-gray-600 font-medium">Axiom</span>
            </div>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onNodeContextMenu={onNodeContextMenu}
          onNodesDelete={() => takeSnapshot()}
          onEdgesDelete={() => takeSnapshot()}
          onNodeDragStart={() => takeSnapshot()}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          panOnDrag={toolMode === 'pan'}
          selectionOnDrag={toolMode === 'lasso'}
          nodesDraggable={toolMode !== 'eraser'}
          elementsSelectable={toolMode !== 'eraser'}
          selectionMode={SelectionMode.Partial}
          connectionMode={"loose" as any}
          fitView
          minZoom={0.01}
          defaultEdgeOptions={{ 
            type: 'floating', 
            animated: false,
            style: { strokeWidth: 3, stroke: '#000000' },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#000000',
            }
          }}
        >
          <Controls />
          <MiniMap />
          <Background gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}


export default function App() {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  );
}
