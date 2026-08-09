import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { configureAccessTokenProvider } from './api/client'
import { getValidAccessToken, initializeAuthentication, logout } from './auth'

const root = ReactDOM.createRoot(document.getElementById('root')!)

async function startApplication(): Promise<void> {
  try {
    await initializeAuthentication()
    configureAccessTokenProvider(getValidAccessToken)
    root.render(<App onLogout={logout} />)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The identity provider is unavailable.'
    root.render(
      <main className="app-shell">
        <div className="notice notice--error" role="alert">
          <strong>Authentication is unavailable.</strong>
          <span>{message}</span>
          <button onClick={() => window.location.reload()} type="button">
            Try again
          </button>
        </div>
      </main>,
    )
  }
}

void startApplication()
