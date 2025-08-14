import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const ChartComponent = ({ config, description, chartData }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

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
        const newIsMobile = window.innerWidth <= 768;

        if (chartInstance.current) {
          chartInstance.current.resize();

          // 如果屏幕尺寸类型发生变化，重新生成配置
          if (newIsMobile !== isMobile) {
            setIsMobile(newIsMobile);

            // 触发父组件重新生成配置
            if (chartData && window.convertToEChartsConfig) {
              const newChartData = { ...chartData, isMobile: newIsMobile };
              const newConfig = window.convertToEChartsConfig(newChartData);
              chartInstance.current.setOption(newConfig, true);
            }
          }
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
  }, [config, isMobile, chartData]);

  return (
    <div className="chart-container">
      <div
        ref={chartRef}
        className="chart-canvas"
        style={{
          width: '100%',
          height: isMobile ? '300px' : '450px',
          minHeight: isMobile ? '250px' : '350px'
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
