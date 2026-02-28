import { useEffect, useRef, useState } from 'react';
import styles from './Hero.module.css';

export default function Hero({ onExplore }) {
  const heroRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hasGyro, setHasGyro] = useState(false);

  useEffect(() => {
    // 1. Mouse interaction for desktop
    const handleMouseMove = (e) => {
      if (!heroRef.current || hasGyro) return;

      const { left, top, width, height } = heroRef.current.getBoundingClientRect();
      const x = e.clientX - left;
      const y = e.clientY - top;

      const centerX = width / 2;
      const centerY = height / 2;

      // Calculate percentage from center (-1 to 1)
      const percentX = (x - centerX) / centerX;
      const percentY = (y - centerY) / centerY;

      // Max tilt angle (degrees)
      const maxTilt = 12;

      // RotateX corresponds to Y movement (pitch), RotateY to X movement (yaw)
      setTilt({
        x: -(percentY * maxTilt),
        y: percentX * maxTilt
      });
    };

    // Smooth reset on mouse leave
    const handleMouseLeave = () => {
      if (!hasGyro) {
        setTilt({ x: 0, y: 0 });
      }
    };

    // 2. Gyroscope interaction for mobile
    const handleDeviceOrientation = (e) => {
      // Gamma is the left-to-right tilt in degrees, where right is positive
      // Beta is the front-to-back tilt in degrees, where front is positive
      if (e.beta && e.gamma) {
        setHasGyro(true);
        const maxTilt = 15;

        // Assume baseline holding angle is ~45 degrees
        let tiltX = e.beta - 45;
        let tiltY = e.gamma;

        // Constrain
        tiltX = Math.max(-maxTilt, Math.min(maxTilt, tiltX));
        tiltY = Math.max(-maxTilt, Math.min(maxTilt, tiltY));

        setTilt({
          x: -tiltX, // Invert for natural parallax feel
          y: tiltY
        });
      }
    };

    const node = heroRef.current;
    if (node) {
      node.addEventListener('mousemove', handleMouseMove);
      node.addEventListener('mouseleave', handleMouseLeave);
      // Listen for gyro on window
      window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    }

    return () => {
      if (node) {
        node.removeEventListener('mousemove', handleMouseMove);
        node.removeEventListener('mouseleave', handleMouseLeave);
      }
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    };
  }, [hasGyro]);

  return (
    <section
      ref={heroRef}
      className={styles.heroSection}
      style={{
        '--tilt-x': `${tilt.x}deg`,
        '--tilt-y': `${tilt.y}deg`
      }}
    >
      <div className={styles.parallaxContainer}>
        {/* Deep background layer containing the webp image */}
        <div className={styles.backgroundLayer}></div>

        {/* Floating text layer */}
        <div className={styles.contentLayer}>
          <h1 className={styles.headline}>The AAPI Grocery Index</h1>
          <p className={styles.subtext}>Tracking how inflation is impacting the prices of Asian foods in the U.S.</p>

          <button className={styles.exploreBtn} onClick={onExplore}>
            Scroll to Explore
            <span className={styles.arrowDown}>↓</span>
          </button>
        </div>
      </div>
    </section>
  );
}
