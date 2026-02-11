/**
 * Debug Panel Component
 * Displays debugging information in the bottom left corner
 */

import React, { useState, useEffect } from "react";

export default function DebugPanel({ viewState, selectedParcel, userLocation, isLoading }) {
	const [fps, setFps] = useState(60);
	const [frameCount, setFrameCount] = useState(0);
	const [lastTime, setLastTime] = useState(Date.now());

	// Simple FPS counter
	useEffect(() => {
		let animationFrameId;

		const countFrame = () => {
			setFrameCount((prev) => prev + 1);
			const now = Date.now();

			if (now - lastTime >= 1000) {
				setFps(frameCount);
				setFrameCount(0);
				setLastTime(now);
			}

			animationFrameId = requestAnimationFrame(countFrame);
		};

		animationFrameId = requestAnimationFrame(countFrame);

		return () => cancelAnimationFrame(animationFrameId);
	}, [frameCount, lastTime]);

	return (
		<div className="fixed bottom-4 left-4 bg-black/80 backdrop-blur-sm border border-neon-green rounded-lg p-3 text-xs font-mono z-40 max-w-xs">
			<div className="text-neon-green font-bold mb-2">DEBUG INFO</div>

			{/* FPS */}
			<div className="text-gray-300 mb-2">
				<div>FPS: <span className="text-neon-green">{fps}</span></div>
			</div>

			{/* View State */}
			<div className="text-gray-300 mb-2 border-t border-gray-600 pt-2">
				<div className="text-gray-400">View State:</div>
				<div>Lat: <span className="text-neon-green">{viewState.latitude.toFixed(4)}</span></div>
				<div>Lng: <span className="text-neon-green">{viewState.longitude.toFixed(4)}</span></div>
				<div>Zoom: <span className="text-neon-green">{viewState.zoom.toFixed(2)}</span></div>
			</div>

			{/* Loading State */}
			<div className="text-gray-300 mb-2 border-t border-gray-600 pt-2">
				<div>Loading: <span className={isLoading ? "text-red-400" : "text-green-400"}>{isLoading ? "YES" : "NO"}</span></div>
			</div>

			{/* Selected Parcel */}
			<div className="text-gray-300 mb-2 border-t border-gray-600 pt-2">
				<div>Selected Parcel:</div>
				<div className={selectedParcel ? "text-green-400" : "text-gray-500"}>
					{selectedParcel ? "YES" : "NONE"}
				</div>
			</div>

			{/* User Location */}
			<div className="text-gray-300 border-t border-gray-600 pt-2">
				<div>User Location:</div>
				<div className={userLocation ? "text-green-400" : "text-gray-500"}>
					{userLocation ? "ACQUIRED" : "PENDING"}
				</div>
			</div>
		</div>
	);
}
