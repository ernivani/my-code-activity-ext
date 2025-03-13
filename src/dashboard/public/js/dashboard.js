/* global document, fetch, console, Chart, localStorage */

// Chart.js default configuration
Chart.defaults.color = '#666';
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Theme management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Update chart colors based on theme
    updateChartColors(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

function updateChartColors(theme) {
    const textColor = theme === 'light' ? '#666' : '#e0e0e0';
    Chart.defaults.color = textColor;
    
    // Update all existing charts
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.options.scales?.y?.ticks && (chart.options.scales.y.ticks.color = textColor);
            chart.options.scales?.x?.ticks && (chart.options.scales.x.ticks.color = textColor);
            chart.update();
        }
    });
}

// Add default chart options
const defaultChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
        duration: 400 // Faster animations
    },
    layout: {
        padding: 10
    }
};

let currentData = null;
let currentRange = 'day';
let charts = {}; // Store chart instances

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupTimeRangeButtons();
    setupThemeToggle();
    fetchData('day'); // Default to daily view
});

function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.addEventListener('click', toggleTheme);
}

function setupTimeRangeButtons() {
    const buttons = document.querySelectorAll('.time-range-selector button');
    buttons.forEach(button => {
        // Set initial active state based on data-range
        if (button.dataset.range === 'day') {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
        
        button.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            currentRange = button.dataset.range;
            fetchData(currentRange);
        });
    });
}

async function fetchData(timeRange) {
    try {
        const response = await fetch('/api/activity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ timeRange })
        });

        if (!response.ok) throw new Error('Failed to fetch data');
        
        currentData = await response.json();
        updateDashboard(currentData);
    } catch (error) {
        console.error('Error fetching data:', error);
        // On error, use cached data if available
        if (currentData) {
            updateDashboard(currentData);
        }
    }
}

function updateDashboard(data) {
    updateSummaryCards(data);
    
    // Destroy existing charts before creating new ones
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};
    
    // Create new charts
    charts.daily = createDailyChart(data);
    charts.projects = createProjectsPieChart(data);
    charts.languages = createLanguagesPieChart(data);
    charts.hourly = createHourlyHeatmap(data);
    
    updateDetailsList(data);
}

function updateSummaryCards(data) {
    const { timeStats } = data;
    
    // Format total time
    document.getElementById('totalTime').textContent = formatTime(timeStats.totalActiveTime);
    
    // Calculate and format daily average
    const daysInRange = currentRange === 'day' ? 1 : currentRange === 'week' ? 7 : 30;
    const dailyAverage = Math.round(timeStats.totalActiveTime / daysInRange);
    document.getElementById('dailyAverage').textContent = formatTime(dailyAverage);
    
    // Update project and language counts
    document.getElementById('totalProjects').textContent = timeStats.totalProjects;
    document.getElementById('totalLanguages').textContent = Object.keys(timeStats.languageTimes || {}).length;
}

function createDailyChart(data) {
    const ctx = document.getElementById('dailyChart').getContext('2d');
    
    // Process commits to get daily project totals
    const dailyProjectTotals = {};
    const projectColors = {};
    const colors = generateColors(8); // Get the same colors used in pie charts
    let colorIndex = 0;
    
    // Initialize all days in the range with empty project totals
    const today = new Date();
    const daysToShow = currentRange === 'day' ? 1 : currentRange === 'week' ? 7 : 30;
    
    for (let i = 0; i < daysToShow; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dailyProjectTotals[date.toLocaleDateString()] = {};
    }
    
    // Get project totals first to assign colors to most active projects
    const projectTotals = {};
    data.commits.forEach(commit => {
        const project = commit.projectName || 'Unknown';
        if (!projectTotals[project]) {
            projectTotals[project] = 0;
        }
        projectTotals[project] += (commit.duration || 0);
    });

    // Sort projects by total time and assign colors
    Object.entries(projectTotals)
        .sort(([,a], [,b]) => b - a)
        .forEach(([project]) => {
            projectColors[project] = colors[colorIndex % colors.length];
            colorIndex++;
        });
    
    // Fill in actual data
    data.commits.forEach(commit => {
        const date = new Date(commit.timestamp).toLocaleDateString();
        if (dailyProjectTotals[date] !== undefined) {
            const project = commit.projectName || 'Unknown';
            if (!dailyProjectTotals[date][project]) {
                dailyProjectTotals[date][project] = 0;
            }
            dailyProjectTotals[date][project] += (commit.duration || 0);
        }
    });

    const sortedDates = Object.keys(dailyProjectTotals).sort((a, b) => new Date(a) - new Date(b));
    
    // Create datasets for each project
    const allProjects = [...new Set(Object.values(dailyProjectTotals)
        .flatMap(dayData => Object.keys(dayData)))];
    
    const datasets = allProjects.map(project => ({
        label: project,
        data: sortedDates.map(date => dailyProjectTotals[date][project] || 0),
        backgroundColor: projectColors[project],
        borderRadius: 4
    }));

    // Calculate total values for the trend line
    const totalValues = sortedDates.map(date => {
        return Object.values(dailyProjectTotals[date]).reduce((sum, val) => sum + val, 0);
    });

    // Add trend line dataset
    datasets.push({
        label: 'Activity Trend',
        data: totalValues,
        type: 'line',
        borderColor: '#4caf50',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#4caf50',
        fill: false,
        tension: 0.4,
        order: 0
    });
    
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDates.map(date => new Date(date).toLocaleDateString('en-US', { weekday: 'short' })),
            datasets: datasets
        },
        options: {
            ...defaultChartOptions,
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Time (minutes)'
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            return `${context.dataset.label}: ${formatTime(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

function createProjectsPieChart(data) {
    const ctx = document.getElementById('projectsPie').getContext('2d');
    const projectTotals = {};
    
    // Use project time from timeStats instead of lines
    Object.entries(data.timeStats.projectTimes || {}).forEach(([project, time]) => {
        projectTotals[project] = time;
    });

    const sortedProjects = Object.entries(projectTotals)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8); // Show top 8 projects

    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sortedProjects.map(([name]) => name),
            datasets: [{
                data: sortedProjects.map(([,value]) => value),
                backgroundColor: generateColors(sortedProjects.length)
            }]
        },
        options: {
            ...defaultChartOptions,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: Chart.defaults.color,
                        generateLabels: (chart) => {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label} (${formatTime(data.datasets[0].data[i])})`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i,
                                fontColor: Chart.defaults.color
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            return `${context.label}: ${formatTime(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

function createLanguagesPieChart(data) {
    const ctx = document.getElementById('languagesPie').getContext('2d');
    const languageTotals = {};
    
    // Use language time from timeStats instead of lines
    Object.entries(data.timeStats.languageTimes || {}).forEach(([lang, time]) => {
        languageTotals[lang] = time;
    });

    const sortedLanguages = Object.entries(languageTotals)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8); // Show top 8 languages

    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sortedLanguages.map(([name]) => name),
            datasets: [{
                data: sortedLanguages.map(([,value]) => value),
                backgroundColor: generateColors(sortedLanguages.length)
            }]
        },
        options: {
            ...defaultChartOptions,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: Chart.defaults.color,
                        generateLabels: (chart) => {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label} (${formatTime(data.datasets[0].data[i])})`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i,
                                fontColor: Chart.defaults.color
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            return `${context.label}: ${formatTime(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

function createHourlyHeatmap(data) {
    const ctx = document.getElementById('hourlyHeatmap').getContext('2d');
    const hourlyData = new Array(24).fill(0);
    
    // Use time spent instead of lines
    data.commits.forEach(commit => {
        const hour = new Date(commit.timestamp).getHours();
        hourlyData[hour] += (commit.duration || 0);
    });

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (unused, i) => `${i}:00`),
            datasets: [{
                label: 'Time Spent',
                data: hourlyData,
                backgroundColor: '#2196f3',
                borderRadius: 4
            }]
        },
        options: {
            ...defaultChartOptions,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            return `Time: ${formatTime(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Time (minutes)'
                    }
                }
            }
        }
    });
}

function updateDetailsList(data) {
    updateProjectsList(data);
    updateLanguagesList(data);
}

function updateProjectsList(data) {
    const projectsList = document.getElementById('projectsList');
    const projectTotals = data.timeStats.projectTimes || {};
    
    const sortedProjects = Object.entries(projectTotals)
        .sort(([,a], [,b]) => b - a);
    
    const maxValue = Math.max(...Object.values(projectTotals), 1); // Prevent division by zero
    
    projectsList.innerHTML = sortedProjects.map(([name, value]) => `
        <div class="details-item">
            <div>
                <div class="name">${name}</div>
                <div class="progress-bar">
                    <div class="fill" style="width: ${Math.round((value / maxValue) * 100)}%"></div>
                </div>
            </div>
            <div class="time">${formatTime(value)}</div>
        </div>
    `).join('');
}

function updateLanguagesList(data) {
    const languagesList = document.getElementById('languagesList');
    const languageTotals = data.timeStats.languageTimes || {};
    
    const sortedLanguages = Object.entries(languageTotals)
        .sort(([,a], [,b]) => b - a);
    
    const maxValue = Math.max(...Object.values(languageTotals), 1); // Prevent division by zero
    
    languagesList.innerHTML = sortedLanguages.map(([name, value]) => `
        <div class="details-item">
            <div>
                <div class="name">${name}</div>
                <div class="progress-bar">
                    <div class="fill" style="width: ${Math.round((value / maxValue) * 100)}%"></div>
                </div>
            </div>
            <div class="time">${formatTime(value)}</div>
        </div>
    `).join('');
}

function formatTime(minutes) {
    if (!minutes) return '0h 0min';
    
    // Round to nearest minute
    minutes = Math.round(minutes);
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    
    return `${hours}h ${mins}min`;
}

function generateColors(count) {
    const colors = [
        '#2196f3', '#4caf50', '#f44336', '#ff9800', 
        '#9c27b0', '#3f51b5', '#e91e63', '#009688',
        '#ffd700', '#8bc34a', '#795548', '#607d8b',
        '#9575cd', '#f06292', '#4dd0e1', '#ff7043',
        '#d4e157', '#fb8c00', '#7e57c2', '#66bb6a'
    ];
    return colors.slice(0, count);
} 