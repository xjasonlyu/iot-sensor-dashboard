import { expect, test } from '@playwright/test'
import { e2eSensorIds, installDashboardApiMocks } from './fixtures/dashboard-api'

test('renders the dashboard summary, charts, and recent activity', async ({ page }) => {
  const api = await installDashboardApiMocks(page)

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Sensor overview' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Everything looks calm.' })).toBeVisible()
  await expect(page.getByText('2 of 2 sensors online')).toBeVisible()
  await expect(page.locator('.metric-card').filter({ hasText: 'Temperature' })).toContainText('23.4°C')
  await expect(page.locator('.metric-card').filter({ hasText: 'Humidity' })).toContainText('47%')
  await expect(page.locator('.metric-card').filter({ hasText: 'Motion activity' })).toContainText('18%')
  await expect(page.getByLabel('Temperature and humidity history chart')).toBeVisible()
  await expect(page.getByLabel('Motion activity history chart')).toBeVisible()
  await expect(page.locator('.event-list').getByRole('listitem')).toHaveCount(2)
  for (const range of ['1H', '6H', '24H', '7D', '30D', '1Y']) {
    await expect(page.getByRole('button', { name: range, exact: true })).toBeVisible()
  }
  expect(api.authorizationHeaders).toContain('Bearer e2e-access-token')
})

test('reloads dashboard data when the chart range changes', async ({ page }) => {
  const api = await installDashboardApiMocks(page)
  await page.goto('/')
  await expect(page.locator('.metric-card').filter({ hasText: 'Temperature' })).toContainText('23.4°C')

  await page.getByRole('button', { name: '1H' }).click()

  await expect(page.getByRole('button', { name: '1H' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('3 min trend · live')).toBeVisible()
  await expect(page.locator('.metric-card').filter({ hasText: 'Temperature' })).toContainText('1H')
  await expect.poll(() => api.requestedRanges).toContain('1h')

  await page.getByRole('button', { name: '1Y', exact: true }).click()

  await expect(page.getByRole('button', { name: '1Y', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('1 day avg · live')).toBeVisible()
  await expect(page.locator('.metric-card').filter({ hasText: 'Temperature' })).toContainText('1Y')
  await expect.poll(() => api.requestedRanges).toContain('1y')
  await expect.poll(() => api.requestedIntervals).toContain('1d')
})

test('shows an API error and recovers when the user retries', async ({ page }) => {
  await installDashboardApiMocks(page, { summaryFailures: 1 })
  await page.goto('/')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Dashboard data could not be loaded.')
  await expect(alert).toContainText('Sensor data is temporarily unavailable.')

  await alert.getByRole('button', { name: 'Try again' }).click()

  await expect(alert).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Everything looks calm.' })).toBeVisible()
  await expect(page.locator('.metric-card').filter({ hasText: 'Temperature' })).toContainText('23.4°C')
})

test('applies a live sensor reading delivered over SSE', async ({ page }) => {
  const occurredAt = new Date().toISOString()
  await installDashboardApiMocks(page, {
    realtimeDelayMs: 500,
    realtimeEvents: [
      {
        data: {
          id: 'temperature-live-1',
          metric: 'temperature',
          sensorId: e2eSensorIds.climateSensorId,
          timestamp: occurredAt,
          unit: 'C',
          value: 25.8,
        },
        id: 'sse-1',
        occurredAt,
        type: 'sensor.reading',
      },
    ],
  })
  await page.goto('/')

  const temperatureCard = page.locator('.metric-card').filter({ hasText: 'Temperature' })
  await expect(temperatureCard).toContainText('23.4°C')
  await expect(temperatureCard).toContainText('25.8°C')
  await expect(page.getByText(/Last live update/)).toBeVisible()
})
