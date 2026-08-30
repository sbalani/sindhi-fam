import React from "react";
import { supabase } from "../supabase.js";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    void supabase?.auth?.getUser().then(({ data }) =>
      supabase.from("application_errors").insert({
        user_id: data?.user?.id || null,
        message: error?.message || "Unhandled Vansh UI error",
        context: { componentStack: info?.componentStack || "", source: "error-boundary" },
      }),
    ).catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <div className="loading-screen error-state" role="alert">
          <strong>Vansh hit an unexpected error</strong>
          <p>{this.state.error.message || "Please reload and try again."}</p>
          <button className="primary" onClick={() => window.location.reload()}>Reload Vansh</button>
        </div>
      );
    }
    return this.props.children;
  }
}
