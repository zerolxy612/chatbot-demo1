import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

const ChartComponent = ({ config, description }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (chartRef.current && config) {
      // 初始化图表
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }
      
      chartInstance.current = echarts.init(chartRef.current);
      chartInstance.current.setOption(config);

      // 响应式处理
      const handleResize = () => {
        if (chartInstance.current) {
          chartInstance.current.resize();
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartInstance.current) {
          chartInstance.current.dispose();
        }
      };
    }
  }, [config]);

  return (
    <div className="chart-container">
      <div 
        ref={chartRef} 
        className="chart-canvas"
        style={{ 
          width: '100%', 
          height: '400px',
          minHeight: '300px'
        }}
      />
      {description && (
        <div className="chart-description">
          <p>{description}</p>
        </div>
      )}
    </div>
  );
};

export default ChartComponent;
