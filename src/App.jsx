import { useState } from 'react';
import './App.css';
import rawData from './data.json';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip, LineChart, Line, CartesianGrid, XAxis, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import Hero from './components/Hero';

const data = rawData;

// Custom tooltip for sparklines
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip glass-panel">
        <p className="tooltip-price">${payload[0].value.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

// Helper to render the sparkline
const Sparkline = ({ dataPoints, isUp }) => {
  const chartData = dataPoints.map((p, i) => ({ value: p, index: i }));
  const color = isUp ? 'var(--price-up)' : 'var(--price-down)';

  const min = Math.min(...dataPoints);
  const max = Math.max(...dataPoints);
  const padding = (max - min) * 0.1;

  return (
    <div className="sparkline-container" style={{ width: '100%', height: '60px', marginTop: '1rem' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`colorGradient-${isUp}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} />
          <YAxis domain={[min - padding, max + padding]} hide />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={3}
            fillOpacity={1}
            fill={`url(#colorGradient-${isUp})`}
            isAnimationActive={true}
            animationDuration={1500}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const CITY_COLORS = {
  'aggregate': '#f8fafc',
  'sf': '#ef4444',
  'la': '#3b82f6',
  'nyc': '#10b981',
  'fbc': '#f59e0b',
  'tac': '#8b5cf6',
  'chd': '#ec4899'
};

const CITY_NAMES = {
  'aggregate': 'All Locations',
  ...data.cities.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {})
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

function App() {
  const [selectedCities, setSelectedCities] = useState(['aggregate']);
  const [timeframe, setTimeframe] = useState('3M'); // '3M', '6M', '9M', '1YR'
  const [dashboardCity, setDashboardCity] = useState('aggregate');
  const [dashboardTimeframe, setDashboardTimeframe] = useState('3M');

  const toggleCity = (id) => {
    if (id === 'aggregate') {
      setSelectedCities(['aggregate']);
      return;
    }
    setSelectedCities(prev => {
      const withoutAggregate = prev.filter(c => c !== 'aggregate');
      if (withoutAggregate.includes(id)) {
        const next = withoutAggregate.filter(c => c !== id);
        return next.length === 0 ? ['aggregate'] : next;
      } else {
        return [...withoutAggregate, id];
      }
    });
  };

  const getTimeframePoints = () => {
    switch (timeframe) {
      case '3M': return 4;
      case '6M': return 7;
      case '9M': return 10;
      case '1YR': return 13;
      default: return 4;
    }
  };

  const timeframeOptions = ['3M', '6M', '9M', '1YR'];

  const getCityPrices = (cityId) => data.prices[cityId] || [];

  const buildChartData = () => {
    const points = getTimeframePoints();
    const chartData = [];
    const historyLength = 13;
    const startIndex = historyLength - points;

    const labels = Array.from({ length: points }, (_, i) => {
      if (i === points - 1) return 'Now';
      return `-${points - 1 - i}M`
    });

    for (let i = 0; i < points; i++) {
      const dataPoint = { time: labels[i] };

      selectedCities.forEach(cityId => {
        if (cityId === 'aggregate') {
          let totalCost = 0;
          data.cities.forEach(c => {
            const cityPrices = getCityPrices(c.id);
            let cityBasketCost = 0;
            cityPrices.forEach(itemPrice => {
              cityBasketCost += itemPrice.history[startIndex + i];
            });
            totalCost += cityBasketCost;
          });
          dataPoint['aggregate'] = totalCost / data.cities.length;
        } else {
          const cityPrices = getCityPrices(cityId);
          let cityBasketCost = 0;
          cityPrices.forEach(itemPrice => {
            cityBasketCost += itemPrice.history[startIndex + i];
          });
          dataPoint[cityId] = cityBasketCost;
        }
      });
      chartData.push(dataPoint);
    }
    return chartData;
  };

  // Compute year-over-year basket cost for a city or aggregate
  const getYoYBasketData = (cityId) => {
    if (cityId === 'aggregate') {
      let totalCurrent = 0;
      let totalPrevYear = 0;
      data.cities.forEach(c => {
        const prices = getCityPrices(c.id);
        prices.forEach(p => {
          totalCurrent += p.history[p.history.length - 1];
          totalPrevYear += p.history[0];
        });
      });
      const avgCurrent = totalCurrent / data.cities.length;
      const avgPrevYear = totalPrevYear / data.cities.length;
      const yoyChange = ((avgCurrent - avgPrevYear) / avgPrevYear) * 100;
      return { currentBasket: avgCurrent, prevYearBasket: avgPrevYear, yoyChange };
    }
    const prices = getCityPrices(cityId);
    let currentBasket = 0;
    let prevYearBasket = 0;
    prices.forEach(p => {
      currentBasket += p.history[p.history.length - 1];
      prevYearBasket += p.history[0];
    });
    const yoyChange = ((currentBasket - prevYearBasket) / prevYearBasket) * 100;
    return { currentBasket, prevYearBasket, yoyChange };
  };

  const renderHeaderContent = () => {
    const isSingleCity = selectedCities.length === 1 && selectedCities[0] !== 'aggregate';
    const singleCityData = isSingleCity ? data.cities.find(c => c.id === selectedCities[0]) : null;

    if (isSingleCity && singleCityData) {
      const yoy = getYoYBasketData(selectedCities[0]);
      return (
        <motion.div
          className="demographics-grid"
          style={{ marginBottom: '1rem' }}
          initial="hidden"
          animate="show"
          variants={containerVariants}
          key={`chart-demo-${selectedCities[0]}`}
        >
          <motion.div className="demo-card glass-panel" variants={itemVariants}>
            <span className="demo-label">Asian Population</span>
            <span className="demo-value">{singleCityData.demographics.asianPopulation.toLocaleString()}</span>
          </motion.div>
          <motion.div className="demo-card glass-panel" variants={itemVariants}>
            <span className="demo-label">State Population</span>
            <span className="demo-value">{singleCityData.demographics.stateTotalPopulation.toLocaleString()}</span>
          </motion.div>
          <motion.div className="demo-card glass-panel" variants={itemVariants}>
            <span className="demo-label">% of State</span>
            <span className="demo-value text-gradient">{singleCityData.demographics.asianPercentOfState.toFixed(2)}%</span>
          </motion.div>
          <motion.div className="demo-card glass-panel" variants={itemVariants}>
            <span className="demo-label">Same-Week Last Year</span>
            <span className="demo-value">${yoy.prevYearBasket.toFixed(2)}</span>
          </motion.div>
          <motion.div className="demo-card glass-panel" variants={itemVariants}>
            <span className="demo-label">YoY % Change</span>
            <span className={`demo-value ${yoy.yoyChange > 0 ? 'text-up' : yoy.yoyChange < 0 ? 'text-down' : ''}`}>
              {yoy.yoyChange > 0 ? '+' : ''}{yoy.yoyChange.toFixed(1)}%
            </span>
          </motion.div>
        </motion.div>
      );
    }
    return null;
  };

  const renderHistoryChart = () => {
    const chartData = buildChartData();
    return (
      <div className="comparison-chart-container glass-panel" style={{ height: '350px', padding: '1.5rem', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', paddingLeft: '1rem', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Total Basket Cost Over Time (All Locations vs Selected Cities)
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              tickFormatter={(tick) => `$${tick}`}
              dx={-10}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-glass)', borderRadius: '8px', color: '#fff' }}
              formatter={(value, name) => [`$${value.toFixed(2)}`, CITY_NAMES[name]]}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {selectedCities.map(cityId => (
              <Line
                key={cityId}
                type="monotone"
                dataKey={cityId}
                name={CITY_NAMES[cityId]}
                stroke={CITY_COLORS[cityId]}
                strokeWidth={3}
                dot={{ r: 4, fill: CITY_COLORS[cityId], strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                isAnimationActive={true}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const getDashboardTimeframePoints = () => {
    switch (dashboardTimeframe) {
      case '6M': return 6;
      case '9M': return 9;
      case '1YR': return 12;
      default: return 3;
    }
  };

  const renderDashboardCards = () => {
    const citiesToAverage = dashboardCity === 'aggregate'
      ? data.cities
      : data.cities.filter(c => c.id === dashboardCity);

    const citiesCount = citiesToAverage.length;

    const points = getDashboardTimeframePoints();
    const aggregateItems = data.items.map(item => {
      let totalCurrent = 0;
      let totalPrev = 0;

      let avgHistory = Array(points).fill(0);

      citiesToAverage.forEach(city => {
        const prices = getCityPrices(city.id);
        const itemPrice = prices.find(p => p.itemId === item.id);
        if (itemPrice) {
          const relevantHistory = itemPrice.history.slice(-points);
          totalCurrent += relevantHistory[relevantHistory.length - 1];
          totalPrev += relevantHistory[0];

          relevantHistory.forEach((h, i) => {
            avgHistory[i] += h;
          });
        }
      });

      const avgCurrent = totalCurrent / citiesCount;
      const avgPrev = totalPrev / citiesCount;
      const inflationChange = ((avgCurrent - avgPrev) / avgPrev) * 100;

      for (let i = 0; i < points; i++) {
        avgHistory[i] = avgHistory[i] / citiesCount;
      }

      return {
        ...item,
        avgCurrent,
        avgPrev,
        inflation: inflationChange,
        inflationStr: parseFloat(inflationChange.toFixed(1)),
        avgHistory,
        isUp: inflationChange > 0
      };
    });

    return (
      <motion.div
        className="aggregate-view"
        initial="hidden"
        animate="show"
        variants={containerVariants}
        key={`dashboard-${dashboardCity}-${dashboardTimeframe}`}
      >
        <motion.div className="prices-grid" style={{ marginTop: '0rem' }}>
          {aggregateItems.map(item => (
            <motion.div key={item.id} className="price-card glass-panel" variants={itemVariants} whileHover={{ y: -6, transition: { duration: 0.2 } }}>
              <h4>{item.name}</h4>
              <p className="unit">{item.unit}</p>
              <div className="price-details">
                <div className="current-price">${item.avgCurrent.toFixed(2)}</div>
                <div className={`inflation-badge ${item.isUp ? 'up' : item.inflation < 0 ? 'down' : 'flat'}`}>
                  {item.isUp ? <TrendingUp size={16} /> : item.inflation < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                  {Math.abs(item.inflation).toFixed(1)}%
                </div>
              </div>
              <div className="prev-price">Start of {dashboardTimeframe}: ${item.avgPrev.toFixed(2)}</div>
              <Sparkline dataPoints={item.avgHistory} isUp={item.isUp} />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    );
  };

  return (
    <div className="app-wrapper">
      <Hero onExplore={() => document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' })} />

      <div className="app-container" id="dashboard">
        <main className="main-content">
          <section className="chart-section" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', paddingBottom: '4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', padding: '0 1rem' }}>
              <h2 style={{ fontSize: '2rem', margin: 0, fontFamily: 'Outfit, sans-serif' }}>How Much Are My Groceries?</h2>
              <div className="timeframe-selector glass-panel" style={{ margin: 0 }}>
                {timeframeOptions.map(tf => (
                  <button
                    key={tf}
                    className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            {data.lastUpdated && (
              <p style={{ margin: '0 0 1rem 0', padding: '0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', letterSpacing: '0.03em' }}>
                Data as of {new Date(data.lastUpdated).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
            {renderHeaderContent()}

            {renderHistoryChart()}

            <nav className="city-selector">
              <button
                className={`city-btn ${selectedCities.includes('aggregate') ? 'active' : ''}`}
                onClick={() => toggleCity('aggregate')}
              >
                All Locations
              </button>
              {data.cities.map((city) => (
                <button
                  key={city.id}
                  className={`city-btn ${selectedCities.includes(city.id) ? 'active' : ''}`}
                  onClick={() => toggleCity(city.id)}
                >
                  {city.name}
                </button>
              ))}
            </nav>

            <motion.div
              className="scroll-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: [0, 15, 0] }}
              transition={{ opacity: { delay: 1, duration: 1 }, y: { repeat: Infinity, duration: 2, ease: "easeInOut" } }}
              onClick={() => document.getElementById('prices-section').scrollIntoView({ behavior: 'smooth' })}
            >
              <p>Scroll to Explore</p>
              <ChevronDown size={32} />
            </motion.div>
          </section>

          <section id="prices-section" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0 0.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                {dashboardCity === 'aggregate' ? 'All Locations' : `${CITY_NAMES[dashboardCity]} Prices`}
              </h2>
              <div className="timeframe-selector glass-panel" style={{ margin: 0 }}>
                {timeframeOptions.map(tf => (
                  <button
                    key={tf}
                    className={`tf-btn ${dashboardTimeframe === tf ? 'active' : ''}`}
                    onClick={() => setDashboardTimeframe(tf)}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {dashboardCity !== 'aggregate' && (() => {
              const cityData = data.cities.find(c => c.id === dashboardCity);
              if (!cityData) return null;
              const yoy = getYoYBasketData(dashboardCity);
              return (
                <motion.div
                  className="demographics-grid"
                  style={{ marginBottom: '1rem' }}
                  initial="hidden"
                  animate="show"
                  variants={containerVariants}
                  key={`demo-${dashboardCity}`}
                >
                  <motion.div className="demo-card glass-panel" variants={itemVariants}>
                    <span className="demo-label">Asian Population</span>
                    <span className="demo-value">{cityData.demographics.asianPopulation.toLocaleString()}</span>
                  </motion.div>
                  <motion.div className="demo-card glass-panel" variants={itemVariants}>
                    <span className="demo-label">State Population</span>
                    <span className="demo-value">{cityData.demographics.stateTotalPopulation.toLocaleString()}</span>
                  </motion.div>
                  <motion.div className="demo-card glass-panel" variants={itemVariants}>
                    <span className="demo-label">% of State</span>
                    <span className="demo-value text-gradient">{cityData.demographics.asianPercentOfState.toFixed(2)}%</span>
                  </motion.div>
                  <motion.div className="demo-card glass-panel" variants={itemVariants}>
                    <span className="demo-label">Same-Week Last Year</span>
                    <span className="demo-value">${yoy.prevYearBasket.toFixed(2)}</span>
                  </motion.div>
                  <motion.div className="demo-card glass-panel" variants={itemVariants}>
                    <span className="demo-label">YoY % Change</span>
                    <span className={`demo-value ${yoy.yoyChange > 0 ? 'text-up' : yoy.yoyChange < 0 ? 'text-down' : ''}`}>
                      {yoy.yoyChange > 0 ? '+' : ''}{yoy.yoyChange.toFixed(1)}%
                    </span>
                  </motion.div>
                </motion.div>
              );
            })()}

            <div className="dashboard-window glass-panel">
              {renderDashboardCards()}
            </div>

            <nav className="city-selector" style={{ marginTop: '1.5rem' }}>
              <button
                className={`city-btn ${dashboardCity === 'aggregate' ? 'active' : ''}`}
                onClick={() => setDashboardCity('aggregate')}
              >
                All Locations
              </button>
              {data.cities.map((city) => (
                <button
                  key={city.id}
                  className={`city-btn ${dashboardCity === city.id ? 'active' : ''}`}
                  onClick={() => setDashboardCity(city.id)}
                >
                  {city.name}
                </button>
              ))}
            </nav>
          </section>

        </main>

        <footer className="footer">
          <p>
            <strong>Sources:</strong>
          </p>
          <p>
            <strong>Google Shopping:</strong> Retail listings by city-specific grocery prices. All six items were found.
          </p>
          <p>
            <strong>U.S. Census Data:</strong> Demographic data uses the U.S. Census Bureau (ACS 5-Year Estimates, Tables B02001 for Asian population + B01003 for total population).
          </p>
          <p style={{ marginTop: '1rem' }}>
            This tracker covers only a selected basket of Asian goods chosen for monitoring purposes, not the full universe of products. All pricing and inflation figures represent estimates intended to illustrate general trends. <strong>This project is for educational uses only.</strong>
          </p>
          <div className="footer-copyright">
            <p>© 2026 Maxwell Leung, Ph.D. Independent educational project created at California College of the Arts. This project is not an official institutional publication.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
