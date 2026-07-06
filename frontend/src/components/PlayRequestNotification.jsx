import React, { useState, useEffect } from 'react';
import './panels.css';

/**
 * PlayRequestNotification - Shows notification to guest about their request status
 */
export const PlayRequestNotification = ({ socket, roomCode }) => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (socket) {
      // Listen for request acceptance
      socket.on('playRequestAccepted', (data) => {
        const notification = {
          id: data.requestId,
          type: 'success',
          message: data.message || 'Your request was approved!',
          autoClose: true
        };
        addNotification(notification);
      });

      // Listen for request rejection
      socket.on('playRequestRejected', (data) => {
        const notification = {
          id: data.requestId,
          type: 'error',
          message: data.reason || 'Your request was rejected',
          autoClose: true
        };
        addNotification(notification);
      });

      return () => {
        socket.off('playRequestAccepted');
        socket.off('playRequestRejected');
      };
    }
  }, [socket]);

  const addNotification = (notification) => {
    setNotifications(prev => [...prev, notification]);

    // Auto-remove notification after 5 seconds if autoClose is true
    if (notification.autoClose) {
      setTimeout(() => {
        removeNotification(notification.id);
      }, 5000);
    }
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  return (
    <div className="notifications-container">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`notification notification-${notification.type}`}
        >
          <p>{notification.message}</p>
          <button
            className="notification-close"
            onClick={() => removeNotification(notification.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default PlayRequestNotification;
