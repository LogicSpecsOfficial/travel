import React, { useEffect, useRef } from 'react';
import { BookOpen, X as XIcon, Star, Trash2 } from 'lucide-react';

export const MapPreview = ({ points }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || !window.google) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
        zoom: 2, center: { lat: 20, lng: 0 }, disableDefaultUI: true, zoomControl: true,
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
      });
    }
    const map = mapInstanceRef.current;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

    const bounds = new window.google.maps.LatLngBounds();
    const pathCoordinates = [];
    points.forEach((point, index) => {
      if (point.lat && point.lng) {
        const position = { lat: point.lat, lng: point.lng };
        pathCoordinates.push(position);
        bounds.extend(position);
        const marker = new window.google.maps.Marker({
          position, map,
          label: { text: (index + 1).toString(), color: "white", fontWeight: "bold", fontSize: "12px" },
          icon: {
             path: window.google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: point.isOpen === false ? "#EF4444" : "#000000",
             fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2,
          },
          title: point.name,
        });
        const infoWindow = new window.google.maps.InfoWindow({
            content: `<div style="font-family: sans-serif; padding: 5px;"><strong>${index + 1}. ${point.name}</strong><br/>${point.address}</div>`
        });
        marker.addListener("click", () => { infoWindow.open(map, marker); });
        markersRef.current.push(marker);
      }
    });
    if (pathCoordinates.length > 1) {
      polylineRef.current = new window.google.maps.Polyline({
        path: pathCoordinates, geodesic: true, strokeColor: "#000000", strokeOpacity: 0.8, strokeWeight: 3, map: map,
      });
    }
    if (pathCoordinates.length > 0) {
      map.fitBounds(bounds);
      const listener = window.google.maps.event.addListenerOnce(map, "idle", () => { 
        if (map.getZoom() > 15) map.setZoom(15); 
      });
    }
  }, [points]);
  return <div ref={mapContainerRef} className="w-full h-[600px] bg-zinc-100 rounded-3xl shadow-inner" />;
};

export const LocationLibrary = ({ isOpen, onClose, savedLocations, onSelect, onDelete }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2"><BookOpen className="text-zinc-900" size={20} />Saved Locations</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors"><XIcon size={20} /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2 flex-1">
          {savedLocations.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <Star size={32} className="mx-auto mb-2 opacity-20" />
              <p>No saved locations yet.</p>
            </div>
          ) : (
            savedLocations.map(loc => (
              <div key={loc.id} className="group flex items-center justify-between p-4 hover:bg-zinc-50 rounded-2xl border border-transparent hover:border-zinc-200 transition-all">
                <div className="flex-1 cursor-pointer" onClick={() => onSelect(loc)}>
                  <h3 className="font-bold text-zinc-900">{loc.name}</h3>
                  <p className="text-xs text-zinc-500 line-clamp-1">{loc.address}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onDelete(loc.id); }} className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors ml-2"><Trash2 size={16} /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
